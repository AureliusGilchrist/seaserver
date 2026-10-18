/**
 * Client-side end-to-end encryption for the profile chat.
 *
 * Threat model: the server stores ciphertexts and must never be able to read
 * messages. The PIN is the user's secret — it never leaves the device.
 *
 * How it fits together:
 *  1. Setup: generate an ECDH P-256 keypair. Derive an AES key from the PIN
 *     with PBKDF2 (random salt). Seal the private key under the PIN key.
 *     Publish {salt, verifier, publicKey, sealedPrivateKey} to the server.
 *     The verifier is an encryption of a known constant — decrypting it on
 *     unlock proves the PIN was right without a server round-trip of secrets.
 *  2. Unlock: derive the PIN key from PIN + salt, decrypt the verifier to
 *     check it, then unseal the private key and keep it in memory only.
 *  3. Conversation key: ECDH(myPrivateKey, peerPublicKey) → HKDF → AES-GCM
 *     key, cached per peer. Both sides derive the same key, the server can't.
 *  4. Messages/reactions/images are AES-GCM encrypted with that key.
 */

const VERIFIER_PLAINTEXT = "seanime-chat-verifier-v1"
const PBKDF2_ITERATIONS = 310_000

function subtle(): SubtleCrypto {
    if (typeof crypto === "undefined" || !crypto.subtle) {
        throw new Error("WebCrypto unavailable in this environment")
    }
    return crypto.subtle
}

function toBase64(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    let s = ""
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s)
}

function fromBase64(s: string): Uint8Array {
    const raw = atob(s)
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    return bytes
}

function randomBytes(len: number): Uint8Array {
    const b = new Uint8Array(len)
    crypto.getRandomValues(b)
    return b
}

// ─────────────────────────────────────────────────────────────────────────────
// Identity

export type ChatIdentity = {
    salt: string
    verifier: string
    publicKey: string
    encryptedPrivateKey: string
}

/**
 * Generates a fresh chat identity from a PIN. The returned bundle goes to the
 * server verbatim; the private key itself never does.
 */
export async function generateChatIdentity(pin: string): Promise<{ identity: ChatIdentity } & { privateKey: CryptoKey }> {
    const salt = toBase64(randomBytes(16))
    const pinKey = await derivePinKey(pin, salt)

    const pair = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"])
    const publicKeyJwk = await subtle().exportKey("jwk", pair.publicKey)
    const privJwk = await subtle().exportKey("jwk", pair.privateKey)
    const sealed = await sealWithPinKey(pinKey, JSON.stringify(privJwk))

    return {
        identity: {
            salt,
            verifier: sealed.verifier,
            publicKey: JSON.stringify(publicKeyJwk),
            encryptedPrivateKey: sealed.encryptedPrivateKey,
        },
        privateKey: pair.privateKey,
    }
}

/** Derives the AES key that seals/unseals the private key, from PIN + salt. */
async function derivePinKey(pin: string, salt: string): Promise<CryptoKey> {
    const base = await subtle().importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"])
    return subtle().deriveKey(
        { name: "PBKDF2", salt: fromBase64(salt) as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        base,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
    )
}

async function encryptJson(key: CryptoKey, value: unknown): Promise<{ iv: string, ciphertext: string }> {
    const iv = randomBytes(12)
    const data = new TextEncoder().encode(JSON.stringify(value))
    const ct = await subtle().encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, data as unknown as BufferSource)
    return { iv: toBase64(iv), ciphertext: toBase64(ct) }
}

async function decryptJson<T>(key: CryptoKey, iv: string, ciphertext: string): Promise<T> {
    const pt = await subtle().decrypt(
        { name: "AES-GCM", iv: fromBase64(iv) as unknown as BufferSource },
        key,
        fromBase64(ciphertext) as unknown as BufferSource,
    )
    return JSON.parse(new TextDecoder().decode(pt)) as T
}

/** Seals a string payload + produces the verifier in one shot. */
async function sealWithPinKey(pinKey: CryptoKey, payload: string): Promise<{ verifier: string, encryptedPrivateKey: string }> {
    const verifier = await encryptJson(pinKey, VERIFIER_PLAINTEXT)
    const priv = await encryptJson(pinKey, payload)
    return { verifier: JSON.stringify(verifier), encryptedPrivateKey: JSON.stringify(priv) }
}

/**
 * Unlocks a chat identity: checks the PIN against the verifier and, on
 * success, returns the unsealed private key. Throws if the PIN is wrong.
 */
export async function unlockChatIdentity(
    state: { salt: string, verifier: string, encryptedPrivateKey: string },
    pin: string,
): Promise<CryptoKey> {
    const pinKey = await derivePinKey(pin, state.salt)
    // Wrong PIN → GCM auth failure → throws.
    const v = await decryptJson<string>(pinKey, ...parseSealed(state.verifier))
    if (v !== VERIFIER_PLAINTEXT) throw new Error("Invalid PIN")
    const privJwk = await decryptJson<JsonWebKey>(pinKey, ...parseSealed(state.encryptedPrivateKey))
    return subtle().importKey("jwk", privJwk, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"])
}

function parseSealed(sealed: string): [string, string] {
    const parsed = JSON.parse(sealed) as { iv: string, ciphertext: string }
    return [parsed.iv, parsed.ciphertext]
}

// ─────────────────────────────────────────────────────────────────────────────
// Conversation keys

const conversationKeyCache = new Map<string, Promise<CryptoKey>>()

/**
 * Derives (and caches) the shared conversation key between my private key and
 * a peer's public key. Both participants compute the identical key. The HKDF
 * salt binds the key to the sorted profile pair.
 */
export async function getConversationKey(
    myPrivateKey: CryptoKey,
    myProfileId: number,
    peerId: number,
    peerPublicKeyJwk: string,
): Promise<CryptoKey> {
    const cacheKey = `${myProfileId}-${peerId}`
    const cached = conversationKeyCache.get(cacheKey)
    if (cached) return cached

    const promise = (async () => {
        const peerPub = await subtle().importKey("jwk", JSON.parse(peerPublicKeyJwk) as JsonWebKey, { name: "ECDH", namedCurve: "P-256" }, false, [])
        const bits = await subtle().deriveBits({ name: "ECDH", public: peerPub }, myPrivateKey, 256)
        const hkdfBase = await subtle().importKey("raw", bits as unknown as BufferSource, "HKDF", false, ["deriveKey"])
        const pairSalt = [myProfileId, peerId].sort((a, b) => a - b).join("-")
        return subtle().deriveKey(
            {
                name: "HKDF",
                hash: "SHA-256",
                salt: new TextEncoder().encode(`seanime-chat-${pairSalt}`),
                info: new TextEncoder().encode("seanime-chat-conversation-key"),
            },
            hkdfBase,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"],
        )
    })()

    conversationKeyCache.set(cacheKey, promise)
    promise.catch(() => conversationKeyCache.delete(cacheKey))
    return promise
}

// ─────────────────────────────────────────────────────────────────────────────
// Message encryption

export type SealedPayload = { iv: string, ciphertext: string }

export async function encryptText(key: CryptoKey, text: string): Promise<SealedPayload> {
    const iv = randomBytes(12)
    const ct = await subtle().encrypt(
        { name: "AES-GCM", iv: iv as unknown as BufferSource },
        key,
        new TextEncoder().encode(text) as unknown as BufferSource,
    )
    return { iv: toBase64(iv), ciphertext: toBase64(ct) }
}

export async function decryptText(key: CryptoKey, iv: string, ciphertext: string): Promise<string> {
    if (!ciphertext) return ""
    const pt = await subtle().decrypt(
        { name: "AES-GCM", iv: fromBase64(iv) as unknown as BufferSource },
        key,
        fromBase64(ciphertext) as unknown as BufferSource,
    )
    return new TextDecoder().decode(pt)
}

export async function encryptBytes(key: CryptoKey, bytes: Uint8Array): Promise<SealedPayload> {
    const iv = randomBytes(12)
    const ct = await subtle().encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, bytes as unknown as BufferSource)
    return { iv: toBase64(iv), ciphertext: toBase64(ct) }
}

export async function decryptBytes(key: CryptoKey, iv: string, ciphertext: string): Promise<Uint8Array> {
    if (!ciphertext) return new Uint8Array()
    const pt = await subtle().decrypt(
        { name: "AES-GCM", iv: fromBase64(iv) as unknown as BufferSource },
        key,
        fromBase64(ciphertext) as unknown as BufferSource,
    )
    return new Uint8Array(pt)
}

/** Clears cached conversation keys (used on lock/reset). */
export function clearConversationKeys() {
    conversationKeyCache.clear()
}

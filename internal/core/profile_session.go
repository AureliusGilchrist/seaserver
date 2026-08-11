package core

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// ProfileSession represents a signed session token tying a browser client to a profile.
// The token is a simple HMAC-SHA256 signed JSON payload (not a full JWT library to avoid deps).

type ProfileSessionPayload struct {
	ProfileID uint   `json:"pid"`
	IsAdmin   bool   `json:"adm"`
	IssuedAt  int64  `json:"iat"`
	ExpiresAt int64  `json:"exp"`
	ClientID  string `json:"cid"` // ties to the Seanime-Client-Id cookie
	// Epoch ties the session to one run of the server. See ProfileManager.GetSessionEpoch.
	Epoch string `json:"ses"`
}

// ProfileSessionDuration is how long a session lasts without being used. Any request renews it (see
// ProfileSessionMiddleware), so this is the idle limit rather than a ceiling on how long you can
// stay signed in.
const ProfileSessionDuration = 24 * time.Hour

const profileSessionDuration = ProfileSessionDuration

// CreateProfileSessionToken creates a signed session token for a profile, stamped with the epoch of
// the server run that issued it.
//
// A day, renewed on use, and it survives the server restarting. That last part is what changed: the
// epoch used to be what decided how long a session lived, and every restart of the server — an
// update, a crash, a settings change that rebuilt the process — signed every client out. On a
// server that restarts a few times an hour that is a PIN prompt a few times an hour, which is what
// this is here to stop.
//
// The epoch is still stamped and still read, but as a reason to *reissue* rather than to refuse: see
// ValidateProfileSessionToken, which hands back the payload alongside ErrSessionFromPreviousRun, and
// the middleware, which mints a fresh token under the current epoch and returns it in the response.
// The client is signed in throughout and never sees it happen.
//
// The state this originally guarded against — a client rendering as signed in to a server holding
// nothing behind the session — is not a thing a rejection was needed for. There is no per-run
// session state to be out of step with: everything a session names is looked up by profile ID from
// disk, on demand, and is exactly as available a second after a restart as a second before one.
func CreateProfileSessionToken(secret []byte, epoch string, profileID uint, isAdmin bool, clientID string) (string, error) {
	now := time.Now()
	payload := ProfileSessionPayload{
		ProfileID: profileID,
		IsAdmin:   isAdmin,
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(profileSessionDuration).Unix(),
		ClientID:  clientID,
		Epoch:     epoch,
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadBytes)

	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(payloadB64))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return payloadB64 + "." + sig, nil
}

// ErrSessionFromPreviousRun is returned for a token issued by an earlier run of the server. It is a
// perfectly valid, unexpired session that simply predates this process.
//
// It comes back *with* the payload, not instead of it, because it is not a refusal — it is a request
// to reissue. Callers that can mint a token should honour the session and hand back a fresh one
// under the current epoch; callers that cannot may treat the payload as good as it stands.
var ErrSessionFromPreviousRun = errors.New("session belongs to a previous run of the server")

// ValidateProfileSessionToken verifies and decodes a profile session token.
//
// A token that fails its signature or has expired returns a nil payload and an error, and nothing
// should be done with it. A token from an earlier run of the server returns the decoded payload
// together with ErrSessionFromPreviousRun — valid, and due for renewal.
func ValidateProfileSessionToken(secret []byte, epoch string, token string) (*ProfileSessionPayload, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return nil, errors.New("invalid token format")
	}

	payloadB64 := parts[0]
	sigB64 := parts[1]

	// Verify signature
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(payloadB64))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(sigB64), []byte(expectedSig)) {
		return nil, errors.New("invalid token signature")
	}

	// Decode payload
	payloadBytes, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return nil, fmt.Errorf("invalid token payload: %w", err)
	}

	var payload ProfileSessionPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return nil, fmt.Errorf("invalid token payload: %w", err)
	}

	// Check expiration
	if time.Now().Unix() > payload.ExpiresAt {
		return nil, errors.New("token expired")
	}

	// Tokens from an earlier run, and tokens minted before sessions carried an epoch at all. The
	// payload goes back with the error so the caller can renew rather than sign anybody out.
	if payload.Epoch != epoch {
		return &payload, ErrSessionFromPreviousRun
	}

	return &payload, nil
}

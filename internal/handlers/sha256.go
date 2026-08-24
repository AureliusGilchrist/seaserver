package handlers

import "crypto/sha256"

// sha256Sum hashes a PKCE verifier so the OAuth2 client can send the S256 challenge.
func sha256Sum(input string) []byte {
	h := sha256.Sum256([]byte(input))
	return h[:]
}

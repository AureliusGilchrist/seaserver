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

// ProfileSessionDuration is the idle lifetime of a session during one server run. Requests renew
// it; a backend restart invalidates it regardless of the remaining duration.
const ProfileSessionDuration = 24 * time.Hour

const profileSessionDuration = ProfileSessionDuration

// CreateProfileSessionToken creates a signed session token for a profile, stamped with the epoch of
// the server run that issued it.
//
// Tokens are renewed while the server is running, but are invalidated when the server restarts.
// This makes the client return to profile selection instead of presenting stale profile state to a
// newly started backend.
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

// ErrSessionFromPreviousRun is returned for a token issued by an earlier run of the server.
var ErrSessionFromPreviousRun = errors.New("session belongs to a previous run of the server")

// ValidateProfileSessionToken verifies and decodes a profile session token.
//
// A token that fails its signature, has expired, or belongs to an earlier run returns a nil payload
// and an error.
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

	// Reject old-run and epochless tokens so a backend restart cannot leave the client in a stale
	// profile context.
	if payload.Epoch != epoch {
		return nil, ErrSessionFromPreviousRun
	}

	return &payload, nil
}

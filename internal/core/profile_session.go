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

const profileSessionDuration = 365 * 24 * time.Hour

// CreateProfileSessionToken creates a signed session token for a profile, valid for the run of the
// server identified by epoch.
//
// The long expiry above is not what decides how long a session lives; the epoch is. A token outlives
// the server that issued it only in the sense that it is still well-formed — the moment the process
// ends, for any reason, every session it issued stops being accepted, because the epoch that made
// them valid died with it.
//
// That is deliberate, and it is the fix for a specific broken state. The signing secret is stored on
// disk and the expiry is a year, so a client that was holding a session when the server went down
// came back holding one that still verified perfectly. It presented that token, the middleware
// accepted it, and the client rendered as signed in — to a server that had rebuilt none of the state
// behind it. Signed in and signed out at the same time: a profile on screen with nothing behind it.
//
// The cost is that a client re-establishes its session after every restart of the server, which is
// what "close the session whenever it shuts down" means. The benefit is that the state above cannot
// occur, because a session can never outlive the process that knows what it refers to.
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

// ErrSessionFromPreviousRun is returned for a token issued by an earlier run of the server. It is
// a perfectly valid token; it simply refers to a session that ended when that process did.
var ErrSessionFromPreviousRun = errors.New("session belongs to a previous run of the server")

// ValidateProfileSessionToken verifies and decodes a profile session token, rejecting any that was
// not issued by the run identified by epoch.
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

	// Tokens from an earlier run, and tokens minted before sessions carried an epoch at all, refer
	// to state this process never had. Refusing them is what makes the client fetch a new session
	// rather than paint a profile the server cannot stand behind.
	if payload.Epoch != epoch {
		return nil, ErrSessionFromPreviousRun
	}

	return &payload, nil
}

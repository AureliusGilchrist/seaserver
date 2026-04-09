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
}

const profileSessionDuration = 30 * 24 * time.Hour // 30 days

// CreateProfileSessionToken creates a signed session token for a profile.
func CreateProfileSessionToken(secret []byte, profileID uint, isAdmin bool, clientID string) (string, error) {
	now := time.Now()
	payload := ProfileSessionPayload{
		ProfileID: profileID,
		IsAdmin:   isAdmin,
		IssuedAt:  now.Unix(),
		ExpiresAt: now.Add(profileSessionDuration).Unix(),
		ClientID:  clientID,
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

// ValidateProfileSessionToken verifies and decodes a profile session token.
func ValidateProfileSessionToken(secret []byte, token string) (*ProfileSessionPayload, error) {
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

	return &payload, nil
}

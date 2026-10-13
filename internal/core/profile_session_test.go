package core

import (
	"errors"
	"testing"
)

// A restart changes the run epoch, but a valid unexpired session remains usable and can be
// reissued under the new epoch by the HTTP middleware.
func TestSessionsSurviveARestartForRenewal(t *testing.T) {
	secret := []byte("a-signing-secret-that-lives-on-disk")

	firstRun, err := newSessionEpoch()
	if err != nil {
		t.Fatalf("epoch: %v", err)
	}

	token, err := CreateProfileSessionToken(secret, firstRun, 7, true, "client-1")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	// Within the run that issued it, the session works exactly as before.
	payload, err := ValidateProfileSessionToken(secret, firstRun, token)
	if err != nil {
		t.Fatalf("a session was rejected by the run that issued it: %v", err)
	}
	if payload.ProfileID != 7 || !payload.IsAdmin || payload.ClientID != "client-1" {
		t.Errorf("payload came back wrong: %+v", payload)
	}

	// The server goes down — cleanly, or by crash, it makes no difference — and comes back up.
	secondRun, err := newSessionEpoch()
	if err != nil {
		t.Fatalf("epoch: %v", err)
	}
	if secondRun == firstRun {
		t.Fatal("two runs produced the same epoch")
	}

	payload, err = ValidateProfileSessionToken(secret, secondRun, token)
	if !errors.Is(err, ErrSessionFromPreviousRun) {
		t.Fatalf("expected a previous-run session to be identified for renewal (err = %v)", err)
	}
	if payload == nil || payload.ProfileID != 7 || !payload.IsAdmin || payload.ClientID != "client-1" {
		t.Fatalf("previous-run session did not preserve its identity: %+v", payload)
	}

	renewedToken, err := CreateProfileSessionToken(secret, secondRun, payload.ProfileID, payload.IsAdmin, payload.ClientID)
	if err != nil {
		t.Fatalf("renew: %v", err)
	}
	renewedPayload, err := ValidateProfileSessionToken(secret, secondRun, renewedToken)
	if err != nil {
		t.Fatalf("renewed session was rejected: %v", err)
	}
	if renewedPayload.ProfileID != payload.ProfileID || renewedPayload.ClientID != payload.ClientID {
		t.Errorf("renewal changed the session identity: %+v", renewedPayload)
	}
}

// Tokens issued before sessions carried an epoch are still signed and unexpired, so they can be
// accepted once and reissued with the current epoch.
func TestSessionsWithoutAnEpochAreRenewed(t *testing.T) {
	secret := []byte("secret")

	epochless, err := CreateProfileSessionToken(secret, "", 3, false, "client-2")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	current, _ := newSessionEpoch()
	payload, err := ValidateProfileSessionToken(secret, current, epochless)
	if !errors.Is(err, ErrSessionFromPreviousRun) {
		t.Fatalf("expected an epochless session to be identified for renewal (err = %v)", err)
	}
	if payload == nil || payload.ProfileID != 3 || payload.IsAdmin || payload.ClientID != "client-2" {
		t.Fatalf("epochless session did not preserve its identity: %+v", payload)
	}
}

// A forged or corrupted token still fails on the signature, before the epoch is ever consulted.
func TestTamperedSessionsStillFailOnSignature(t *testing.T) {
	epoch, _ := newSessionEpoch()
	token, err := CreateProfileSessionToken([]byte("real-secret"), epoch, 1, true, "c")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	if _, err := ValidateProfileSessionToken([]byte("other-secret"), epoch, token); err == nil {
		t.Error("a token signed with a different secret was accepted")
	}
	if _, err := ValidateProfileSessionToken([]byte("real-secret"), epoch, "not-a-token"); err == nil {
		t.Error("a malformed token was accepted")
	}
}

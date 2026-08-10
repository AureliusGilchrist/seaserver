package core

import (
	"errors"
	"testing"
)

// The behaviour that fixes "signed in and signed out at the same time": a session token outlives the
// process that issued it as a string, but not as a session. The signing secret is on disk and the
// expiry is a year, so nothing else stops a client from presenting a year-old token to a server that
// has rebuilt none of the state behind it.
func TestSessionsDoNotSurviveARestart(t *testing.T) {
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

	if _, err := ValidateProfileSessionToken(secret, secondRun, token); !errors.Is(err, ErrSessionFromPreviousRun) {
		t.Errorf("a session from the previous run was accepted (err = %v)", err)
	}
}

// Tokens issued before sessions carried an epoch have no business being honoured either: they are
// exactly the year-old tokens this is meant to retire.
func TestSessionsWithoutAnEpochAreRefused(t *testing.T) {
	secret := []byte("secret")

	epochless, err := CreateProfileSessionToken(secret, "", 3, false, "client-2")
	if err != nil {
		t.Fatalf("create: %v", err)
	}

	current, _ := newSessionEpoch()
	if _, err := ValidateProfileSessionToken(secret, current, epochless); !errors.Is(err, ErrSessionFromPreviousRun) {
		t.Errorf("a token carrying no epoch was accepted (err = %v)", err)
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

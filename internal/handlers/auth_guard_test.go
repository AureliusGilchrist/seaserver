package handlers

import (
	"context"
	"testing"
	"time"
)

func TestSecureEqual(t *testing.T) {
	if !secureEqual("abc", "abc") {
		t.Fatal("equal secrets should match")
	}
	if secureEqual("abd", "abc") || secureEqual("ab", "abc") {
		t.Fatal("different secrets should not match")
	}
	if secureEqual("", "") {
		t.Fatal("an unset secret must never match")
	}
}

func TestAuthGuardFreeAllowanceIsInstant(t *testing.T) {
	g := &authGuard{peers: map[string]*guardPeer{}}
	start := time.Now()
	for i := 0; i < guardFreeFailures; i++ {
		g.failed(context.Background(), "10.0.0.1")
	}
	if time.Since(start) > 200*time.Millisecond {
		t.Fatal("failures within the allowance should not be delayed")
	}
}

func TestAuthGuardSlowsRepeatedFailures(t *testing.T) {
	g := &authGuard{peers: map[string]*guardPeer{}}
	for i := 0; i < guardFreeFailures; i++ {
		g.failed(context.Background(), "10.0.0.2")
	}
	start := time.Now()
	g.failed(context.Background(), "10.0.0.2")
	if time.Since(start) < guardPenalty-50*time.Millisecond {
		t.Fatal("failure past the allowance should be held")
	}

	// Another address is unaffected
	start = time.Now()
	g.failed(context.Background(), "10.0.0.3")
	if time.Since(start) > 200*time.Millisecond {
		t.Fatal("a different address should not be slowed")
	}
}

func TestAuthGuardHonoursCancellation(t *testing.T) {
	g := &authGuard{peers: map[string]*guardPeer{}}
	for i := 0; i < guardFreeFailures; i++ {
		g.failed(context.Background(), "10.0.0.4")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	start := time.Now()
	g.failed(ctx, "10.0.0.4")
	if time.Since(start) > 200*time.Millisecond {
		t.Fatal("a cancelled request should not be held")
	}
}

package onlinestream_download

import (
	"errors"
	"fmt"
	"testing"
)

func TestDestinationTakenIsFinal(t *testing.T) {
	err := fmt.Errorf("download: %w", destinationTakenError{finalError{errors.New("taken")}})
	if !isDestinationTaken(err) || !isFinal(err) {
		t.Fatalf("taken=%v final=%v", isDestinationTaken(err), isFinal(err))
	}
	if isDestinationTaken(finalError{errors.New("drm")}) {
		t.Fatal("a plain final error is not a taken destination")
	}
}

func TestNotOnlineIsFinal(t *testing.T) {
	err := notOnlineError{finalError{errors.New("not available anywhere")}}
	if !isNotOnline(err) || !isFinal(err) {
		t.Fatalf("notOnline=%v final=%v", isNotOnline(err), isFinal(err))
	}
	if !isNoSource(errors.New("automatic matching returned no results")) {
		t.Fatal("AnimePahe's no-match answer is a missing source")
	}
	if isNoSource(errors.New("dial tcp: i/o timeout")) {
		t.Fatal("a timeout is not a missing source")
	}
}

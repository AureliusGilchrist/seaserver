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

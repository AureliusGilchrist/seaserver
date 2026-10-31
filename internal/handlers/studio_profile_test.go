package handlers

import (
	"testing"
	"time"
)

func TestStudioProfileEntryFresh(t *testing.T) {
	complete := &studioProfileEntry{data: &StudioProfile{}, at: time.Now().Add(-time.Hour)}
	if !complete.fresh() {
		t.Error("a complete filmography an hour old should still be served")
	}
	partial := &studioProfileEntry{data: &StudioProfile{Partial: true}, at: time.Now().Add(-time.Hour)}
	if partial.fresh() {
		t.Error("a filmography cut short an hour ago should be fetched again")
	}
}

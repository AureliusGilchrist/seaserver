package mediastream

import (
	"context"
	"errors"
	"testing"
	"time"

	"seanime/internal/util/result"
)

func TestExtractionStatusWaitsForCompletion(t *testing.T) {
	p := &PlaybackManager{extractionStatuses: result.NewMap[string, *ExtractionStatus]()}
	p.BeginExtraction("h")
	status, ok := p.GetExtractionStatus("h")
	if !ok {
		t.Fatal("no status recorded when the extraction began")
	}
	if status.Wait(context.Background(), 50*time.Millisecond) {
		t.Fatal("Wait returned finished while the extraction was still running")
	}

	go func() {
		time.Sleep(50 * time.Millisecond)
		p.CompleteExtraction("h", nil, nil)
	}()
	if !status.Wait(context.Background(), 2*time.Second) {
		t.Fatal("Wait did not return when the extraction completed")
	}
	if _, failed := status.SubsFailure(); failed {
		t.Fatal("a clean extraction reported a subtitle failure")
	}

	// A second completion (or one with no Begin) must not panic on a closed channel.
	p.CompleteExtraction("h", errors.New("x"), nil)
	if _, failed := status.SubsFailure(); !failed {
		t.Fatal("subtitle failure not recorded")
	}
}

func TestExtractionWaitStopsWithTheRequest(t *testing.T) {
	p := &PlaybackManager{extractionStatuses: result.NewMap[string, *ExtractionStatus]()}
	p.BeginExtraction("h")
	status, _ := p.GetExtractionStatus("h")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if status.Wait(ctx, time.Minute) {
		t.Fatal("Wait reported finished for a cancelled request")
	}
}

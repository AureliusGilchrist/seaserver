package manga

import (
	"context"
	"errors"
	"testing"
	"time"

	"seanime/internal/database/models"
)

func TestShouldResumeChapterDownloadQueue(t *testing.T) {
	tests := []struct {
		name                   string
		pref                   *models.ClientPref
		hasInterruptedDownload bool
		want                   bool
	}{
		{
			name: "active queue resumes",
			pref: &models.ClientPref{Value: "true"},
			want: true,
		},
		{
			name:                   "explicit pause does not resume stale items",
			pref:                   &models.ClientPref{Value: "false"},
			hasInterruptedDownload: true,
			want:                   false,
		},
		{
			name:                   "legacy interrupted item resumes",
			hasInterruptedDownload: true,
			want:                   true,
		},
		{
			name: "no queue state does not start",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldResumeChapterDownloadQueue(tt.pref, tt.hasInterruptedDownload); got != tt.want {
				t.Fatalf("shouldResumeChapterDownloadQueue() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestWaitForMediaMapReadyWaitsForInitialScan(t *testing.T) {
	readyCh := make(chan struct{})
	downloader := &Downloader{mediaMapReadyCh: readyCh}
	result := make(chan error, 1)

	go func() {
		result <- downloader.waitForMediaMapReady(context.Background())
	}()

	select {
	case err := <-result:
		t.Fatalf("waitForMediaMapReady returned before the scan completed: %v", err)
	case <-time.After(10 * time.Millisecond):
	}

	downloader.mediaMapMu.Lock()
	downloader.mediaMapReady = true
	close(readyCh)
	downloader.mediaMapMu.Unlock()

	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("waitForMediaMapReady returned an error: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("waitForMediaMapReady did not return after the scan completed")
	}
}

func TestWaitForMediaMapReadyHonorsContextCancellation(t *testing.T) {
	downloader := &Downloader{mediaMapReadyCh: make(chan struct{})}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if err := downloader.waitForMediaMapReady(ctx); !errors.Is(err, context.Canceled) {
		t.Fatalf("waitForMediaMapReady() error = %v, want context.Canceled", err)
	}
}

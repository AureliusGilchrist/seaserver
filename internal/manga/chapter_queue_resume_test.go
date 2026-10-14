package manga

import (
	"testing"

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

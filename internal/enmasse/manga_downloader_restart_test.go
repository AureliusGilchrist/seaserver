package enmasse

import (
	"encoding/json"
	"testing"
)

func TestShouldResumeOnStartup(t *testing.T) {
	tests := []struct {
		name     string
		progress string
		want     bool
	}{
		{
			name:     "no saved progress",
			progress: "null",
			want:     false,
		},
		{
			name:     "legacy progress does not auto-resume",
			progress: `{"processed_titles":["One"],"downloaded_manga":["One"]}`,
			want:     false,
		},
		{
			name:     "paused progress does not auto-resume",
			progress: `{"processed_titles":["One"],"resume_on_startup":false}`,
			want:     false,
		},
		{
			name:     "interrupted run auto-resumes",
			progress: `{"processed_titles":["One"],"resume_on_startup":true}`,
			want:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var progress *MangaDownloaderProgress
			if err := json.Unmarshal([]byte(tt.progress), &progress); err != nil {
				t.Fatalf("unmarshal progress: %v", err)
			}

			if got := shouldResumeOnStartup(progress); got != tt.want {
				t.Fatalf("shouldResumeOnStartup() = %v, want %v", got, tt.want)
			}
		})
	}
}

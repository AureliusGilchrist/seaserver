package playbackmanager

import (
	"testing"

	"seanime/internal/database/db"
)

func TestEpisodeWatchedThreshold(t *testing.T) {
	tests := []struct {
		name      string
		profileID uint
		value     *int
		want      float64
	}{
		{name: "default without profile", want: 0.8},
		{name: "default without override", profileID: 1, want: 0.8},
		{name: "70 percent", profileID: 1, value: intPtr(70), want: 0.7},
		{name: "75 percent", profileID: 1, value: intPtr(75), want: 0.75},
		{name: "80 percent", profileID: 1, value: intPtr(80), want: 0.8},
		{name: "85 percent", profileID: 1, value: intPtr(85), want: 0.85},
		{name: "90 percent", profileID: 1, value: intPtr(90), want: 0.9},
		{name: "95 percent", profileID: 1, value: intPtr(95), want: 0.95},
		{name: "invalid threshold", profileID: 1, value: intPtr(60), want: 0.8},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pm := &PlaybackManager{
				activeProfileID: tt.profileID,
				getClientSettingsOverridesFunc: func(uint) *db.ClientSettingsOverrides {
					if tt.value == nil {
						return nil
					}
					return &db.ClientSettingsOverrides{EpisodeWatchedThreshold: tt.value}
				},
			}
			if got := pm.EpisodeWatchedThreshold(); got != tt.want {
				t.Fatalf("EpisodeWatchedThreshold() = %v, want %v", got, tt.want)
			}
		})
	}
}

func intPtr(value int) *int {
	return &value
}

package mediaplayer

import "testing"

func TestRepository_getCompletionThreshold(t *testing.T) {
	tests := []struct {
		name       string
		configured float64
		want       float64
	}{
		{name: "configured threshold", configured: 0.95, want: 0.95},
		{name: "invalid threshold uses default", configured: 1.1, want: 0.75},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &Repository{
				completionThreshold: 0.75,
				completionThresholdFunc: func() float64 {
					return tt.configured
				},
			}
			if got := repo.getCompletionThreshold(); got != tt.want {
				t.Fatalf("getCompletionThreshold() = %v, want %v", got, tt.want)
			}
		})
	}
}

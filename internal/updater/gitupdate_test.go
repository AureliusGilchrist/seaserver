package updater

import (
	"testing"
	"time"
)

func TestNextGitAutoUpdateTime(t *testing.T) {
	location, err := time.LoadLocation(gitUpdateTimeZone)
	if err != nil {
		t.Fatalf("load update time zone: %v", err)
	}

	tests := []struct {
		name string
		now  string
		want string
	}{
		{
			name: "before daily run",
			now:  "2026-10-12T01:59:00-07:00",
			want: "2026-10-12T02:00:00-07:00",
		},
		{
			name: "after daily run",
			now:  "2026-10-12T02:01:00-07:00",
			want: "2026-10-13T02:00:00-07:00",
		},
		{
			name: "exactly at daily run",
			now:  "2026-10-12T02:00:00-07:00",
			want: "2026-10-13T02:00:00-07:00",
		},
		{
			name: "spring daylight-saving transition",
			now:  "2026-03-08T01:30:00-08:00",
			want: "2026-03-08T03:00:00-07:00",
		},
		{
			name: "fall daylight-saving transition",
			now:  "2026-11-01T01:30:00-07:00",
			want: "2026-11-01T02:00:00-08:00",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			now, err := time.Parse(time.RFC3339, test.now)
			if err != nil {
				t.Fatalf("parse test time: %v", err)
			}
			want, err := time.Parse(time.RFC3339, test.want)
			if err != nil {
				t.Fatalf("parse expected time: %v", err)
			}

			got := nextGitAutoUpdateTime(now, location)
			if !got.Equal(want) {
				t.Errorf("nextGitAutoUpdateTime() = %s, want %s", got.Format(time.RFC3339), want.Format(time.RFC3339))
			}
			if got.Location().String() != gitUpdateTimeZone {
				t.Errorf("next run location = %q, want %q", got.Location(), gitUpdateTimeZone)
			}
		})
	}
}

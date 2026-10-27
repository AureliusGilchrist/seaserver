package updater

import (
	"errors"
	"strings"
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

func TestGitTrustsOnlyTheCheckout(t *testing.T) {
	args := gitArgs("/srv/seaserver", "fetch", "origin", "main")
	if len(args) < 3 || args[0] != "-c" || args[1] != "safe.directory=/srv/seaserver" || args[2] != "fetch" {
		t.Fatalf("git args = %v, want -c safe.directory=<checkout> first", args)
	}
}

func TestExplainGitErrorNamesTheCause(t *testing.T) {
	cases := map[string]string{
		"git fetch: exit status 128: fatal: detected dubious ownership in repository at '/srv'":                          "owned by another user",
		"git fetch: exit status 128: fatal: unable to access 'https://github.com/x': Could not resolve host: github.com": "couldn't reach GitHub",
		"git fetch: exec: \"git\": executable file not found in $PATH":                                                   "isn't installed",
	}
	for raw, want := range cases {
		got := explainGitError(errors.New(raw), "/srv")
		if !strings.Contains(got.Error(), want) || !strings.Contains(got.Error(), raw) {
			t.Errorf("explainGitError(%q) = %q, want it to say %q and keep git's message", raw, got, want)
		}
	}
}

func TestParsePendingCommits(t *testing.T) {
	out := "abc1234\x1f5.2.1-30: news\x1fAurelius\x1f1793100000\nbad line\n"
	got := parsePendingCommits(out)
	if len(got) != 1 || got[0].Hash != "abc1234" || got[0].Subject != "5.2.1-30: news" || got[0].Date != 1793100000 {
		t.Fatalf("parsePendingCommits = %+v", got)
	}
}

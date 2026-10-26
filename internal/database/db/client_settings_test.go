package db

import "testing"

func TestParseClientSettingsOverridesLenient(t *testing.T) {
	// autoPauseStaleWatchingDays is an int; a fraction there used to drop every setting.
	o := parseClientSettingsOverrides(`{"newsNotifyNewEntries":false,"newsNotifyMode":"lists","autoPauseStaleWatchingDays":2.6,"mpvAutoSkipOpening":"yes"}`)
	if o == nil {
		t.Fatal("nil overrides")
	}
	if o.NewsNotifyNewEntries == nil || *o.NewsNotifyNewEntries {
		t.Fatalf("newsNotifyNewEntries lost: %v", o.NewsNotifyNewEntries)
	}
	if o.NewsNotifyMode == nil || *o.NewsNotifyMode != "lists" {
		t.Fatalf("newsNotifyMode lost")
	}
	if o.AutoPauseStaleWatchingDays == nil || *o.AutoPauseStaleWatchingDays != 3 {
		t.Fatalf("fraction not rounded: %v", o.AutoPauseStaleWatchingDays)
	}
	if o.MpvAutoSkipOpening != nil {
		t.Fatalf("unreadable field should be skipped")
	}
	if parseClientSettingsOverrides(`not json`) != nil {
		t.Fatal("garbage should give nil")
	}
	if o := parseClientSettingsOverrides(`{"newsNotifyMode":"all"}`); o == nil || *o.NewsNotifyMode != "all" {
		t.Fatal("clean decode broken")
	}
}

package db

import (
	"encoding/json"
	"math"
	"reflect"
	"strings"
)

// clientSettingsPrefKey is the client-prefs key the web client stores its per-profile
// "Personal" settings under (see seanime-web/src/lib/client-settings.ts).
const clientSettingsPrefKey = "sea-client-settings"

// ClientSettingsOverrides mirrors the web client's per-profile Personal settings that have
// server-side consumers. Pointer fields mean "not overridden by this profile"; a non-nil
// pointer replaces the server-wide value for decisions made on behalf of that profile.
type ClientSettingsOverrides struct {
	AutoUpdateProgress       *bool `json:"autoUpdateProgress,omitempty"`
	EnableWatchContinuity    *bool `json:"enableWatchContinuity,omitempty"`
	AutoPlayNextEpisode      *bool `json:"autoPlayNextEpisode,omitempty"`
	StillWatchingChecks      *bool `json:"stillWatchingChecksEnabled,omitempty"`
	StillWatchingEpisodes    *int  `json:"stillWatchingEpisodes,omitempty"`
	HideAudienceScore        *bool `json:"hideAudienceScore,omitempty"`
	BlurAdultContent         *bool `json:"blurAdultContent,omitempty"`
	DisableAnimeCardTrailers *bool `json:"disableAnimeCardTrailers,omitempty"`
	MangaAutoUpdateProgress  *bool `json:"mangaAutoUpdateProgress,omitempty"`

	AutoPauseStaleWatchingDays *int `json:"autoPauseStaleWatchingDays,omitempty"`

	MpvAutoSkipOpening *bool `json:"mpvAutoSkipOpening,omitempty"`
	MpvAutoSkipEnding  *bool `json:"mpvAutoSkipEnding,omitempty"`
	MpvAutoSkipFiller  *bool `json:"mpvAutoSkipFiller,omitempty"`

	// News: whether this profile wants a notification filed when a new RSS entry appears.
	NewsNotifyNewEntries *bool `json:"newsNotifyNewEntries,omitempty"`
	// Which new entries become notifications: "all", "lists" (headline names something on the
	// profile's chosen lists, below) or "keywords" (the default). See news.NotifyFilter.
	NewsNotifyMode *string `json:"newsNotifyMode,omitempty"`
	// Which lists "lists" mode reads. Each defaults to on when unset.
	NewsNotifyListCurrent   *bool `json:"newsNotifyListCurrent,omitempty"`
	NewsNotifyListPlanning  *bool `json:"newsNotifyListPlanning,omitempty"`
	NewsNotifyListCompleted *bool `json:"newsNotifyListCompleted,omitempty"`
	// Comma-separated keywords for "keywords" mode. Empty uses the built-in list.
	NewsNotifyKeywords *string `json:"newsNotifyKeywords,omitempty"`
	// Whether the community timeline shows paced news cards for this profile (default on).
	CommunityShowNews *bool `json:"communityShowNews,omitempty"`
	// TimeZone is the IANA zone of the profile's device (set automatically by the client), so
	// "at 4 AM" and "on Christmas" mean the user's 4 AM and Christmas, not the server's.
	TimeZone *string `json:"timeZone,omitempty"`

	EnableRichPresence                      *bool `json:"enableRichPresence,omitempty"`
	EnableAnimeRichPresence                 *bool `json:"enableAnimeRichPresence,omitempty"`
	EnableMangaRichPresence                 *bool `json:"enableMangaRichPresence,omitempty"`
	RichPresenceHideSeanimeRepositoryButton *bool `json:"richPresenceHideSeanimeRepositoryButton,omitempty"`
	RichPresenceShowAniListProfileButton    *bool `json:"richPresenceShowAniListProfileButton,omitempty"`
}

// GetClientSettingsOverrides reads and parses the current database's per-profile Personal
// settings. Returns (nil, nil) when the profile has no overrides or the value is not a JSON object —
// callers fall back to the server-wide settings.
func (db *Database) GetClientSettingsOverrides() (*ClientSettingsOverrides, error) {
	pref, err := db.GetClientPref(clientSettingsPrefKey)
	if err != nil || pref == nil {
		return nil, err
	}
	return parseClientSettingsOverrides(pref.Value), nil
}

// parseClientSettingsOverrides decodes the stored settings. One field the server can't read (a
// fraction where a whole number belongs, a type that changed) must not cost the profile every other
// setting — it used to, and the news notifier then applied the defaults over the user's choices — so
// when the whole object fails, each field is decoded on its own and the unreadable ones are skipped.
func parseClientSettingsOverrides(raw string) *ClientSettingsOverrides {
	var o ClientSettingsOverrides
	if err := json.Unmarshal([]byte(raw), &o); err == nil {
		return &o
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal([]byte(raw), &fields); err != nil {
		return nil
	}
	// Start clean: the failed decode above may have half-filled o.
	o = ClientSettingsOverrides{}
	v := reflect.ValueOf(&o).Elem()
	t := v.Type()
	for i := 0; i < t.NumField(); i++ {
		name := strings.Split(t.Field(i).Tag.Get("json"), ",")[0]
		data, ok := fields[name]
		if !ok || name == "" {
			continue
		}
		target := reflect.New(t.Field(i).Type)
		if err := json.Unmarshal(data, target.Interface()); err == nil {
			v.Field(i).Set(target.Elem())
			continue
		}
		// A number stored with a fraction, for an integer setting: round it.
		elem := t.Field(i).Type
		if elem.Kind() == reflect.Ptr && elem.Elem().Kind() == reflect.Int {
			var f float64
			if err := json.Unmarshal(data, &f); err == nil {
				n := int(math.Round(f))
				v.Field(i).Set(reflect.ValueOf(&n))
			}
		}
	}
	return &o
}


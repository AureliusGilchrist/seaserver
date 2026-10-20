package db

import (
	"encoding/json"
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

	EnableRichPresence                      *bool `json:"enableRichPresence,omitempty"`
	EnableAnimeRichPresence                 *bool `json:"enableAnimeRichPresence,omitempty"`
	EnableMangaRichPresence                 *bool `json:"enableMangaRichPresence,omitempty"`
	RichPresenceHideSeanimeRepositoryButton *bool `json:"richPresenceHideSeanimeRepositoryButton,omitempty"`
	RichPresenceShowAniListProfileButton    *bool `json:"richPresenceShowAniListProfileButton,omitempty"`
}

// GetClientSettingsOverrides reads and parses the current database's per-profile Personal
// settings. Returns (nil, nil) when the profile has no overrides or the value is unparsable —
// callers fall back to the server-wide settings.
func (db *Database) GetClientSettingsOverrides() (*ClientSettingsOverrides, error) {
	pref, err := db.GetClientPref(clientSettingsPrefKey)
	if err != nil || pref == nil {
		return nil, err
	}
	var o ClientSettingsOverrides
	if err := json.Unmarshal([]byte(pref.Value), &o); err != nil {
		return nil, nil
	}
	return &o, nil
}


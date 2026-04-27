package scanner

import (
	"encoding/json"
	"seanime/internal/library/anime"
)

type Config struct {
	Hydration HydrationConfig
}

type HydrationConfig struct {
	Rules []*HydrationRule
}

type HydrationRule struct {
	Pattern string              `json:"pattern"`
	MediaID int                 `json:"mediaId"`
	Files   []*HydrationFileRule `json:"files"`
}

type HydrationFileRule struct {
	Filename     string              `json:"filename"`
	IsRegex      bool                `json:"isRegex"`
	Episode      string              `json:"episode"`
	AniDbEpisode string              `json:"aniDbEpisode"`
	Type         anime.LocalFileType `json:"type"`
}

// ToConfig parses a JSON config string into a Config struct.
// Returns nil if the input is empty.
func ToConfig(s string) (*Config, error) {
	if s == "" {
		return nil, nil
	}
	var c Config
	if err := json.Unmarshal([]byte(s), &c); err != nil {
		return nil, err
	}
	return &c, nil
}

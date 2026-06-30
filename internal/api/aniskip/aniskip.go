package aniskip

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const apiBase = "https://api.aniskip.com/v2"

type SkipType string

const (
	SkipTypeOP      SkipType = "op"
	SkipTypeED      SkipType = "ed"
	SkipTypeMixedOP SkipType = "mixed-op"
	SkipTypeMixedED SkipType = "mixed-ed"
	SkipTypeRecap   SkipType = "recap"
)

type Interval struct {
	StartTime float64 `json:"startTime"`
	EndTime   float64 `json:"endTime"`
}

type SkipTime struct {
	Interval      Interval `json:"interval"`
	SkipType      SkipType `json:"skipType"`
	SkipId        string   `json:"skipId"`
	EpisodeLength float64  `json:"episodeLength"`
}

type SkipData struct {
	OP *SkipTime
	ED *SkipTime
}

var httpClient = &http.Client{Timeout: 8 * time.Second}

// FetchSkipData fetches OP and ED skip intervals from AniSkip for the given MAL ID and episode number.
// Returns nil without error when no data is found.
func FetchSkipData(malId int, episode int) (*SkipData, error) {
	url := fmt.Sprintf("%s/skip-times/%d/%d?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&episodeLength=", apiBase, malId, episode)

	resp, err := httpClient.Get(url)
	if err != nil {
		return nil, fmt.Errorf("aniskip: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("aniskip: unexpected status %d", resp.StatusCode)
	}

	var payload struct {
		Found   bool       `json:"found"`
		Results []SkipTime `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return nil, fmt.Errorf("aniskip: decode error: %w", err)
	}
	if !payload.Found || len(payload.Results) == 0 {
		return nil, nil
	}

	data := &SkipData{}
	for i := range payload.Results {
		st := &payload.Results[i]
		switch st.SkipType {
		case SkipTypeOP, SkipTypeMixedOP:
			if data.OP == nil {
				data.OP = st
			}
		case SkipTypeED, SkipTypeMixedED:
			if data.ED == nil {
				data.ED = st
			}
		}
	}

	// Reject ED whose start overlaps with OP (matches frontend normalizeAniSkipData).
	if data.OP != nil && data.ED != nil {
		if data.ED.Interval.StartTime <= data.OP.Interval.EndTime {
			data.ED = nil
		}
	}

	if data.OP == nil && data.ED == nil {
		return nil, nil
	}
	return data, nil
}

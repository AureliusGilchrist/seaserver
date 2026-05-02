package achievement

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// ExpBarProgressionEntry represents a single level's exp bar styling
type ExpBarProgressionEntry struct {
	Entry          int    `json:"entry"`
	LevelRange     string `json:"level_range"`
	Color          string `json:"color,omitempty"`
	Gradient       string `json:"gradient,omitempty"`
	Name           string `json:"name"`
	Effect         string `json:"effect"`
	Shadow         string `json:"shadow,omitempty"`
	Animation      string `json:"animation,omitempty"`
	Sparkles       bool   `json:"sparkles,omitempty"`
	ParticleCount  int    `json:"particle_count,omitempty"`
}

// ExpBarProgression is the full progression data
type ExpBarProgression struct {
	Metadata               map[string]interface{}        `json:"metadata"`
	Phase1PureColors       []ExpBarProgressionEntry      `json:"phase_1_pure_colors"`
	Phase2Gradients        []ExpBarProgressionEntry      `json:"phase_2_gradients"`
	Phase3GradientEffects  []ExpBarProgressionEntry      `json:"phase_3_gradient_effects"`
	Phase4AdvancedEffects  []ExpBarProgressionEntry      `json:"phase_4_advanced_effects"`
	AnimationKeyframes     map[string]string             `json:"animation_keyframes"`
	UsageNotes             map[string]interface{}        `json:"usage_notes"`
}

var (
	progressionData *ExpBarProgression
	progressionOnce sync.Once
)

// LoadExpBarProgression loads the exp bar progression data from JSON file
func LoadExpBarProgression(basePath string) (*ExpBarProgression, error) {
	var err error
	progressionOnce.Do(func() {
		progressionPath := filepath.Join(basePath, "internal", "achievement", "exp_bar_progression.json")
		data, readErr := os.ReadFile(progressionPath)
		if readErr != nil {
			err = readErr
			return
		}

		progression := &ExpBarProgression{}
		if unmarshalErr := json.Unmarshal(data, progression); unmarshalErr != nil {
			err = unmarshalErr
			return
		}

		progressionData = progression
	})
	return progressionData, err
}

// GetExpBarForLevel returns the exp bar styling for a given level
func GetExpBarForLevel(level int) *ExpBarProgressionEntry {
	if progressionData == nil {
		return nil
	}

	// Convert level to entry number (approximately 2.5 levels per entry)
	entryNumber := (level - 1) / 3
	if entryNumber < 0 {
		entryNumber = 0
	}
	if entryNumber >= 333 {
		entryNumber = 332
	}

	// Determine which phase and get the entry
	var entries []ExpBarProgressionEntry
	var phaseOffset int

	if entryNumber < 100 {
		entries = progressionData.Phase1PureColors
		phaseOffset = 0
	} else if entryNumber < 200 {
		entries = progressionData.Phase2Gradients
		phaseOffset = 100
	} else if entryNumber < 300 {
		entries = progressionData.Phase3GradientEffects
		phaseOffset = 200
	} else {
		entries = progressionData.Phase4AdvancedEffects
		phaseOffset = 300
	}

	index := entryNumber - phaseOffset
	if index < 0 || index >= len(entries) {
		if len(entries) > 0 {
			return &entries[len(entries)-1]
		}
		return nil
	}

	return &entries[index]
}

// GetAllExpBarEntries returns all progression entries (for a shop/selector)
func GetAllExpBarEntries() []ExpBarProgressionEntry {
	if progressionData == nil {
		return nil
	}

	all := make([]ExpBarProgressionEntry, 0)
	all = append(all, progressionData.Phase1PureColors...)
	all = append(all, progressionData.Phase2Gradients...)
	all = append(all, progressionData.Phase3GradientEffects...)
	all = append(all, progressionData.Phase4AdvancedEffects...)
	return all
}

// BuildXPBarCSS builds the CSS string for the exp bar fill based on the entry
func BuildXPBarCSS(entry *ExpBarProgressionEntry) string {
	if entry == nil {
		return ""
	}

	if entry.Gradient != "" {
		return entry.Gradient
	}
	if entry.Color != "" {
		return entry.Color
	}
	return ""
}

// BuildXPBarAnimation builds the animation class string based on the entry
func BuildXPBarAnimation(entry *ExpBarProgressionEntry) string {
	if entry == nil {
		return ""
	}

	// Convert animation name to CSS class format
	if entry.Animation != "" {
		return entry.Animation
	}
	return ""
}

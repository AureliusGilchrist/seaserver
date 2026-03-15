package manga_providers

import (
	"fmt"
	"strconv"
	"strings"
)

// GetNormalizedChapter returns a padded chapter string with 4 digits before the decimal point.
// e.g. "1" -> "0001", "35.5" -> "0035.5", "123" -> "0123"
func GetNormalizedChapter(chapter string) string {
	// Check if chapter has a decimal point
	if strings.Contains(chapter, ".") {
		parts := strings.Split(chapter, ".")
		if len(parts) == 2 {
			// Pad the integer part to 4 digits
			intPart := strings.TrimLeft(parts[0], "0")
			if intPart == "" {
				intPart = "0"
			}
			// Parse and pad
			if num, err := strconv.Atoi(intPart); err == nil {
				return fmt.Sprintf("%04d.%s", num, parts[1])
			}
		}
	}
	
	// No decimal point - pad to 4 digits
	unpaddedChStr := strings.TrimLeft(chapter, "0")
	if unpaddedChStr == "" {
		unpaddedChStr = "0"
	}
	if num, err := strconv.Atoi(unpaddedChStr); err == nil {
		return fmt.Sprintf("%04d", num)
	}
	
	// Fallback for non-numeric chapters
	return chapter
}

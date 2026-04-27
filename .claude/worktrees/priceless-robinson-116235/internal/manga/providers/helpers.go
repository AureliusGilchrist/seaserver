package manga_providers

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var chapterOnlyTitleRegex = regexp.MustCompile(`(?i)^chapter\s*0*([0-9]+(?:\.[0-9]+)?)$`)
var chapterWithSuffixTitleRegex = regexp.MustCompile(`(?i)^chapter\s*0*([0-9]+(?:\.[0-9]+)?)(\s*[-:–]\s*.+)$`)
var chapterWithSeasonPrefixRegex = regexp.MustCompile(`(?i)^(S\d+)\s*[-:–]?\s*chapter\s*0*([0-9]+(?:\.[0-9]+)?)(\s*[-:–]\s*.+)?$`)
var chapterNumberRegex = regexp.MustCompile(`0*[0-9]+(?:\.[0-9]+)?`)

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

// GetSeasonAwareChapterNumber checks if the chapter title has a season prefix
// (e.g., "S1 - Chapter 7") and returns a composite chapter number encoding both
// season and chapter for proper ordering (season*10000 + chapter).
// If no season prefix is detected, returns the original chapter number unchanged.
func GetSeasonAwareChapterNumber(chapterTitle string, originalChapter string) string {
	if m := chapterWithSeasonPrefixRegex.FindStringSubmatch(chapterTitle); len(m) >= 3 {
		seasonStr := strings.TrimPrefix(strings.ToUpper(m[1]), "S")
		seasonNum, err := strconv.Atoi(seasonStr)
		if err != nil {
			return originalChapter
		}
		chapterNumStr := m[2]
		chapterNum, err := strconv.ParseFloat(chapterNumStr, 64)
		if err != nil {
			return originalChapter
		}
		composite := float64(seasonNum)*10000 + chapterNum
		if composite == float64(int(composite)) {
			return strconv.Itoa(int(composite))
		}
		return strconv.FormatFloat(composite, 'f', -1, 64)
	}
	return originalChapter
}

// GetDisplayChapterNumber converts normalized chapter numbers like "0001" or "0035.5"
// to user-facing numbers like "1" and "35.5".
func GetDisplayChapterNumber(chapter string) string {
	chapter = strings.TrimSpace(chapter)
	if chapter == "" {
		return ""
	}

	if strings.Contains(chapter, ".") {
		parts := strings.SplitN(chapter, ".", 2)
		left := strings.TrimLeft(parts[0], "0")
		if left == "" {
			left = "0"
		}
		right := strings.TrimRight(parts[1], "0")
		if right == "" {
			return left
		}
		return left + "." + right
	}

	left := strings.TrimLeft(chapter, "0")
	if left == "" {
		left = "0"
	}
	return left
}

// InferDynamicChapterPrefix inspects provider chapter titles from the same series and returns
// the most likely dynamic prefix (e.g. "#" or "Torture") used before chapter numbers.
func InferDynamicChapterPrefix(chapterTitles []string) string {
	return InferDynamicChapterPrefixForSeries(chapterTitles, "")
}

// InferDynamicChapterPrefixForSeries is the same as InferDynamicChapterPrefix but accepts
// a series title fallback. If no prefix can be inferred from chapter titles and the series
// title starts with '#', '#' is used as the dynamic prefix.
func InferDynamicChapterPrefixForSeries(chapterTitles []string, seriesTitle string) string {
	prefixCount := make(map[string]int)
	bestPrefix := ""
	bestCount := 0

	for _, title := range chapterTitles {
		title = strings.TrimSpace(title)
		if title == "" {
			continue
		}
		if chapterOnlyTitleRegex.MatchString(title) || chapterWithSuffixTitleRegex.MatchString(title) || chapterWithSeasonPrefixRegex.MatchString(title) {
			continue
		}

		numberMatches := chapterNumberRegex.FindAllStringIndex(title, -1)
		if len(numberMatches) == 0 {
			continue
		}

		// Use the LAST number in the title as the chapter number.
		// Example: "S2 chapter 52" => prefix "S2 chapter" and chapter number "52".
		lastNumber := numberMatches[len(numberMatches)-1]
		prefix := strings.TrimSpace(title[:lastNumber[0]])
		prefix = strings.TrimSpace(strings.TrimRight(prefix, "-:–"))
		if prefix == "" {
			continue
		}
		if strings.EqualFold(prefix, "chapter") {
			continue
		}
		prefixCount[prefix]++
		if prefixCount[prefix] > bestCount {
			bestCount = prefixCount[prefix]
			bestPrefix = prefix
		}
	}

	if bestPrefix == "" {
		seriesTitle = strings.TrimSpace(seriesTitle)
		if strings.HasPrefix(seriesTitle, "#") {
			return "#"
		}
	}

	return bestPrefix
}

// GetPreferredChapterTitle keeps provider titles as-is and only rewrites generic
// "Chapter N" forms when a dynamic series prefix has been inferred.
func GetPreferredChapterTitle(dynamicPrefix string, chapterTitle string, chapterNumber string) string {
	chapterTitle = strings.TrimSpace(chapterTitle)
	chapterNumber = GetDisplayChapterNumber(chapterNumber)

	if chapterTitle == "" {
		if dynamicPrefix == "" {
			if chapterNumber == "" {
				return ""
			}
			return "Chapter " + chapterNumber
		}
		if dynamicPrefix == "#" {
			return "#" + chapterNumber
		}
		return strings.TrimSpace(dynamicPrefix + " " + chapterNumber)
	}

	if m := chapterOnlyTitleRegex.FindStringSubmatch(chapterTitle); len(m) == 2 {
		if dynamicPrefix == "" {
			number := GetDisplayChapterNumber(m[1])
			return "Chapter " + number
		}
		number := GetDisplayChapterNumber(m[1])
		if dynamicPrefix == "#" {
			return "#" + number
		}
		return strings.TrimSpace(dynamicPrefix + " " + number)
	}

	if m := chapterWithSuffixTitleRegex.FindStringSubmatch(chapterTitle); len(m) == 3 {
		if dynamicPrefix == "" {
			number := GetDisplayChapterNumber(m[1])
			return strings.TrimSpace("Chapter " + number + m[2])
		}
		number := GetDisplayChapterNumber(m[1])
		if dynamicPrefix == "#" {
			return "#" + number + strings.TrimSpace(m[2])
		}
		return strings.TrimSpace(dynamicPrefix + " " + number + m[2])
	}

	// Match season-prefixed titles like "S1 - Chapter 9" or "S2 - Chapter 5 - The Beginning"
	if m := chapterWithSeasonPrefixRegex.FindStringSubmatch(chapterTitle); len(m) >= 3 {
		season := m[1]
		number := GetDisplayChapterNumber(m[2])
		suffix := ""
		if len(m) >= 4 {
			suffix = m[3]
		}
		return strings.TrimSpace(season + " - Chapter " + number + suffix)
	}

	return chapterTitle
}

package unmatched

import (
	"regexp"
	"strconv"
	"strings"
)

// Releases name a season every way a person might write one, and "Season 1 only" is worth nothing if
// it only recognises the way this file's author happened to think of first. The folder holding the
// first season might be called any of:
//
//	Season 1   Season 01   Season One   SEASON 1
//	S1         S01         S 1          S.1
//	1st Season First Season
//	Series 1   Part 1      Cour 1       Season I
//	1          01
//
// …and it might be the whole folder name or a fragment of a longer one ("Some Show S01 [1080p]").
//
// This is deliberately more generous than extractSeasonNumber, the older parser used when a
// download's contents are listed for display. That one runs a bare `s(\d+)` over the lowercased
// name, which finds an "s5" inside a release group as readily as a season, and it is left alone
// because changing what the Unmatched screen displays is not what was asked for here. This parser is
// used only where a wrong answer is cheap in one direction and expensive in the other: not
// recognising season 1 leaves the download for manual matching, while recognising the wrong folder
// as season 1 matches the wrong episodes.
//
// A caveat worth stating, because it is the one case where this can pick too few files: PART and
// COUR are treated as seasons on request, but a split-cour release is usually *one* AniList season
// released in two halves. "Part 1" of such a release is half the episodes of season 1, and matching
// it will trip the episode-count check rather than filing anything wrong — which is the safe way for
// this to be wrong, but it is why the count check exists.

// seasonWordRegex matches "Season 1", "Series 01", "Part 3", "Cour 2" and the spelled-out numbers,
// with any amount of space or punctuation between the word and its number.
var seasonWordRegex = regexp.MustCompile(`(?i)(?:^|[^a-z0-9])(?:season|series|part|cour)[\s._-]*([0-9]{1,2}|[ivx]{1,4}|one|two|three|four|five|six|seven|eight|nine|ten)(?:[^a-z0-9]|$)`)

// ordinalSeasonRegex matches the reversed form: "1st Season", "2nd Season", "First Season".
var ordinalSeasonRegex = regexp.MustCompile(`(?i)(?:^|[^a-z0-9])([0-9]{1,2}(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)[\s._-]*(?:season|series|cour|part)(?:[^a-z0-9]|$)`)

// bareSeasonRegex matches the "S01" family: an S attached to a number, optionally separated by a
// space, dot, dash or underscore, and not followed by an episode number (S01E01 names a single
// episode, not the season folder).
//
// The S must not be preceded by another letter, which is what keeps it off the "s" ending a word —
// "Raws 01", "Subs 12" — that the older parser matches happily.
var bareSeasonRegex = regexp.MustCompile(`(?i)(?:^|[^a-z0-9])s[\s._-]*([0-9]{1,2}|[ivx]{1,4})(?:[^a-z0-9]|$)`)

// bareNumberRegex matches a folder whose entire name is a number: "1", "01".
var bareNumberRegex = regexp.MustCompile(`^([0-9]{1,2})$`)

// spelledNumbers maps the written forms — cardinal, ordinal and roman — to their value. Only as far
// as ten, which is past any season count that exists and well past any that arrives in a batch.
var spelledNumbers = map[string]int{
	"one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
	"six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,

	"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
	"sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,

	"i": 1, "ii": 2, "iii": 3, "iv": 4, "v": 5,
	"vi": 6, "vii": 7, "viii": 8, "ix": 9, "x": 10,
}

// seasonNumberFromFolderName reads the season a folder names, or 0 when it names none.
func seasonNumberFromFolderName(name string) int {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return 0
	}

	// Most specific first: the word forms carry their own meaning and cannot be confused with
	// anything else in a name.
	if n, ok := seasonNumberFrom(seasonWordRegex, trimmed); ok {
		return n
	}
	if n, ok := seasonNumberFrom(ordinalSeasonRegex, trimmed); ok {
		return n
	}
	// A whole-name number, before the S-form: a folder called "1" has no S to find anyway, and
	// checking it here keeps the S-form pattern from having to care about it.
	if n, ok := seasonNumberFrom(bareNumberRegex, trimmed); ok {
		return n
	}
	// S01E01 names one episode. A folder called that is not a season folder, and treating it as
	// one would scoop a single episode up as the whole first season.
	if episodeInSeasonRegex.MatchString(trimmed) {
		return 0
	}
	if n, ok := seasonNumberFrom(bareSeasonRegex, trimmed); ok {
		return n
	}
	return 0
}

// episodeInSeasonRegex matches the S01E01 form, where the season is qualified by an episode.
var episodeInSeasonRegex = regexp.MustCompile(`(?i)(?:^|[^a-z0-9])s[\s._-]*[0-9]{1,2}[\s._-]*e[\s._-]*[0-9]{1,4}(?:[^a-z0-9]|$)`)

// digitOrdinalRegex matches a numeric ordinal — "1st", "02nd", "3rd", "4th" — capturing the digits.
var digitOrdinalRegex = regexp.MustCompile(`^([0-9]{1,2})(?:st|nd|rd|th)$`)

// seasonNumberFrom runs one pattern and turns its capture into a number, digits or words alike.
func seasonNumberFrom(re *regexp.Regexp, name string) (int, bool) {
	match := re.FindStringSubmatch(name)
	if match == nil || len(match) < 2 {
		return 0, false
	}

	captured := strings.ToLower(strings.TrimSpace(match[1]))
	if captured == "" {
		return 0, false
	}

	// "1st", "2nd" — the digits are the number, the suffix only says it is an ordinal. Matched as a
	// whole rather than trimmed character by character: trimming the suffix letters off the end of
	// an arbitrary capture eats the tail of every spelled-out word that happens to end in one
	// ("ten" → "te", "second" → "seco"), which is how this got the written numbers wrong.
	if m := digitOrdinalRegex.FindStringSubmatch(captured); m != nil {
		captured = m[1]
	}

	if value, ok := spelledNumbers[captured]; ok {
		return value, true
	}
	value, err := strconv.Atoi(captured)
	if err != nil || value <= 0 {
		return 0, false
	}
	return value, true
}

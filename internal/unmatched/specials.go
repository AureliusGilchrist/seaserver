package unmatched

import (
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"github.com/5rahim/habari"
)

// OVAs, ONAs and specials are not episodes of the season being matched, and counting them as such
// is how they end up filed as episodes 13, 14, 15 — numbers that belong to episodes which either do
// not exist or, worse, do.
//
// They are left where they are rather than deleted. That is the whole difference between these and
// the creditless/promo content next door in isNCName: a creditless opening is worth nothing to
// anybody, while an OVA is a real thing somebody chose to download. Excluding it from the match
// leaves it in the staging folder to be matched deliberately, to its own entry, which is where it
// belongs — AniList lists most OVAs as separate entries anyway.
//
// The boundaries below are "not a letter or digit" rather than \b, for the same reason as the NC
// patterns: Go treats the underscore as a word character, and releases separate tokens with
// underscores constantly, so \bOVA\b never matches "Show_-_OVA_01".

// specialTokenRegex matches the standalone markers that name non-episode content.
//
// OVA and OAD are unambiguous. ONA is included because a release that labels a file ONA is
// distinguishing it from the TV episodes it sits beside. The numbered SP forms are handled by
// specialEpisodeMarkerRegex below rather than here, because they need their number checked.
var specialTokenRegex = regexp.MustCompile(`(?i)(?:^|[^A-Za-z0-9])(OVA|OAD|ONA|SPECIALS?|OVA\d{1,2})(?:[^A-Za-z0-9]|$)`)

// specialEpisodeMarkerRegex matches the two numbered ways a release says "special episode":
//
//	SP01, SP1, SP001      — a special standing on its own
//	S01SP01, S1SP1, S01SP2 — a special belonging to a stated season
//
// Both numbers may be padded or not, which is why the pattern counts digits loosely and the value is
// checked afterwards: \d{1,3} admits 999, and a file called "SP999" is far more likely to be a
// release quirk than a 999th special. maxSpecialNumber is where that line is drawn.
//
// SP is only ever matched with a number attached. Bare "sp" turns up inside too much else — in
// "Sponsor", in "Spirited", in half the group names — and an episode wrongly called a special is
// left out of its own season, which is the expensive direction to be wrong in.
var specialEpisodeMarkerRegex = regexp.MustCompile(`(?i)(?:^|[^A-Za-z0-9])(?:S(\d{1,3}))?SP(\d{1,3})(?:[^A-Za-z0-9]|$)`)

// maxSpecialNumber is the largest number either half of a marker may carry. Above it, the digits are
// not a special's number — they are a resolution, a year, a checksum, or a group's counter.
const maxSpecialNumber = 100

// hasSpecialEpisodeMarker reports whether a name carries an SPxxx or SxxxSPzzz marker with numbers
// that are plausibly a season and a special rather than something else that happens to be numeric.
func hasSpecialEpisodeMarker(name string) bool {
	for _, match := range specialEpisodeMarkerRegex.FindAllStringSubmatch(name, -1) {
		// match[1] is the season, present only in the SxxxSPzzz form; match[2] is the special.
		if !numberWithinSpecialRange(match[1], true) {
			continue
		}
		if !numberWithinSpecialRange(match[2], false) {
			continue
		}
		return true
	}
	return false
}

// numberWithinSpecialRange reports whether a captured number is between 0 and maxSpecialNumber.
// An absent capture is only allowed where the form makes it optional — the season half.
func numberWithinSpecialRange(digits string, optional bool) bool {
	if digits == "" {
		return optional
	}
	value, err := strconv.Atoi(digits)
	if err != nil {
		return false
	}
	return value >= 0 && value <= maxSpecialNumber
}

// seasonZeroRegex matches the S00Exx form, which is the established way of saying "this is a
// special, not part of any season".
var seasonZeroRegex = regexp.MustCompile(`(?i)(?:^|[^A-Za-z0-9])S0*0E\d{1,3}(?:[^A-Za-z0-9]|$)`)

// specialsDirNames are folder names that hold non-episode content in essentially every release
// that uses them.
//
// Unlike the "Extra" folder, matching one of these does not delete anything — it only keeps its
// contents out of the episode numbering — so this can afford to be generous where that has to be
// exact.
var specialsDirNames = []string{
	"ova", "ovas", "oad", "oads", "ona", "onas",
	"special", "specials", "sp", "extras", "bonus",
}

// normalizedForTagMatching blanks out the parts of a file name that are free text — the episode
// title and the release group — so a tag can only be found in the structural remainder.
//
// Without this, a group called "OVA-Raws" marks every one of its releases as an OVA, and an episode
// genuinely titled "The Special" is excluded from its own season.
func normalizedForTagMatching(name string) string {
	m := habari.Parse(name)
	if m == nil {
		return name
	}
	normalized := name
	if m.EpisodeTitle != "" {
		normalized = strings.Replace(normalized, m.EpisodeTitle, "PLACEHOLDER", 1)
	}
	if m.ReleaseGroup != "" {
		normalized = strings.Replace(normalized, m.ReleaseGroup, "PLACEHOLDER", 1)
	}
	return normalized
}

// isSpecialName reports whether a file is an OVA, ONA, OAD or special rather than an episode of the
// season being matched.
//
// The name is normalised the same way isNCName normalises it — the parsed episode title and release
// group blanked out — so that a group called "OVA-Raws" or an episode titled "The Special" cannot
// trigger it. What is left is the structural part of the name, which is where a real marker lives.
func isSpecialName(name string) bool {
	normalized := normalizedForTagMatching(name)
	return specialTokenRegex.MatchString(normalized) ||
		seasonZeroRegex.MatchString(normalized) ||
		hasSpecialEpisodeMarker(normalized)
}

// pathHasSpecialsSegment reports whether any folder in the file's path marks its contents as
// non-episode content.
func pathHasSpecialsSegment(relPath string) bool {
	segments := strings.Split(filepath.ToSlash(relPath), "/")
	// The last segment is the file itself, which isSpecialName judges on its own terms.
	for i := 0; i < len(segments)-1; i++ {
		seg := strings.ToLower(strings.TrimSpace(segments[i]))
		for _, candidate := range specialsDirNames {
			if seg == candidate {
				return true
			}
		}
	}
	return false
}

// isSpecialContent is the question the match asks of every file: is this something other than an
// episode of the anime being matched to?
func isSpecialContent(name, relPath string) bool {
	return isSpecialName(name) || pathHasSpecialsSegment(relPath)
}

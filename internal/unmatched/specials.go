package unmatched

import (
	"path/filepath"
	"regexp"
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
// distinguishing it from the TV episodes it sits beside. SP is only matched with a number attached
// ("SP01"), because bare "sp" turns up inside too much else.
var specialTokenRegex = regexp.MustCompile(`(?i)(?:^|[^A-Za-z0-9])(OVA|OAD|ONA|SPECIALS?|SP\d{1,2}|OVA\d{1,2})(?:[^A-Za-z0-9]|$)`)

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
	return specialTokenRegex.MatchString(normalized) || seasonZeroRegex.MatchString(normalized)
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

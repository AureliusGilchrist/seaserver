package manga

import (
	"regexp"
	"strings"
)

// A folder is named by whoever made it, and AniList is indexed by what the publisher called the
// series. Between those two facts sits everything that makes a search miss: a volume marker, a
// scanlation group in brackets, a year, a subtitle AniList files under a different name, a folder
// named after the subtitle alone, or a name so long that the one wrong word in it sinks the whole
// query.
//
// Searching once, with the whole folder name, asks the question in exactly one way and takes the
// silence for an answer. These are the other ways of asking: the name with the noise removed, each
// side of its separators on its own, and its opening words — each a real name somebody could have
// meant, ordered by how likely it is to be the one.
//
// They cost one search each, so they are tried in order and stopped as soon as something answers.

// bracketedSegment matches "[Group]", "(2011)", "{v2}" and the space around them.
var bracketedSegment = regexp.MustCompile(`\s*[\[\(\{][^\]\)\}]*[\]\)\}]\s*`)

// trailingVolumeMarker matches the release furniture that ends a folder name: "Vol. 3", "v03",
// "Volume 12", "c001-050", "Ch 5", and a bare year.
var trailingVolumeMarker = regexp.MustCompile(`(?i)\s*[-–—_]?\s*\b(?:vol(?:ume)?\.?\s*\d+(?:\s*-\s*\d+)?|v\d{1,3}(?:\s*-\s*v?\d{1,3})?|c(?:h(?:apter)?)?\.?\s*\d+(?:\s*-\s*\d+)?|\d{4})\s*$`)

// titleSeparator is where a title tends to be joined to its subtitle.
var titleSeparator = regexp.MustCompile(`\s+[-–—~:|]\s+|:\s+|\s+\|\s+`)

// maxTitleVariants caps how many ways one name is asked about. Each is an AniList request against a
// shared budget, and past the first few the variants are short enough that what they match is more
// likely to be a coincidence than the series.
const maxTitleVariants = 6

// titleSearchVariants is the ordered list of names to search for a folder, best guess first.
//
// The full name is always first: when it is right — which is most of the time — nothing else is ever
// tried, and this costs exactly what searching once cost.
func titleSearchVariants(name string) []string {
	variants := make([]string, 0, maxTitleVariants)
	seen := make(map[string]bool)

	add := func(candidate string) {
		candidate = strings.TrimSpace(candidate)
		candidate = strings.Trim(candidate, "-–—_~:|,. ")
		// Two characters is not a name, it is a substring that will match something irrelevant.
		if len([]rune(candidate)) < 3 {
			return
		}
		key := strings.ToLower(candidate)
		if seen[key] || len(variants) >= maxTitleVariants {
			return
		}
		seen[key] = true
		variants = append(variants, candidate)
	}

	raw := strings.TrimSpace(name)
	add(raw)
	add(cleanMangaTitle(raw))

	// Without the brackets and the volume markers — the parts of the name that describe the files
	// rather than the series.
	stripped := strings.TrimSpace(bracketedSegment.ReplaceAllString(raw, " "))
	stripped = strings.TrimSpace(trailingVolumeMarker.ReplaceAllString(stripped, ""))
	add(stripped)

	// Each side of the first separator. The main title is the likelier of the two, but a folder
	// named after the subtitle is common enough — "Kaguya-sama - Love is War" is filed under both
	// halves by different people — that the second is worth a request when the first found nothing.
	source := stripped
	if source == "" {
		source = raw
	}
	if parts := titleSeparator.Split(source, 2); len(parts) == 2 {
		add(parts[0])
		add(parts[1])
	}

	// The opening words, for a name long enough that the tail of it is doing the damage.
	if words := strings.Fields(source); len(words) > 3 {
		add(strings.Join(words[:3], " "))
	}

	return variants
}

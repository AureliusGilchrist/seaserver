package unmatched

// A match renames files by position: the episodes are sorted, numbered, and given canonical names.
// That is only correct when the files being matched really are the episodes of the anime being
// matched to. When the counts disagree, something is wrong with that assumption, and the numbering
// is wrong in a way nothing downstream can detect — the files land in the library under episode
// numbers that mean something else.
//
// Both directions are worth stopping for, and for different reasons.
//
// Fewer files than episodes usually means the download is not finished, or only part of it was
// selected. That is the case that put four episodes of a twelve-episode season into the library
// numbered 1 to 4 when they were in fact whichever four had arrived.
//
// More files than episodes means the release carries something the anime does not: extras that were
// not recognised as extras, a second season in the same folder, specials counted as episodes. Those
// get numbered as episodes past the end of the season — exactly how a set of creditless openings
// became episodes 14 to 17.
//
// Neither is necessarily wrong. Plenty of releases legitimately hold fewer or more files than
// AniList's episode count, and the user may know exactly what they are doing. So this is a
// confirmation, not a refusal: the match stops, reports what it was about to do, and runs unchanged
// once the answer comes back.

// PlannedEpisode is one file and the name it would be given, for the preview shown before a
// mismatched match is allowed to proceed.
type PlannedEpisode struct {
	// RelPath is the file's path inside the download, as it is now.
	RelPath string `json:"relPath"`
	// NewName is what it would be called in the library.
	NewName string `json:"newName"`
	// Episode is the number it would be filed under.
	Episode int `json:"episode"`
	// Season is the season it was read as, for releases that carry more than one.
	Season int `json:"season,omitempty"`
}

// CountMismatch is a match held back because the number of files does not match the number of
// episodes the anime is expected to have.
type CountMismatch struct {
	// Expected is the anime's episode count, from the record stored when the download was queued
	// or from the metadata provider.
	Expected int `json:"expected"`
	// Found is how many video files the match was about to file as episodes.
	Found int `json:"found"`
	// Destination is the library folder the files would go to.
	Destination string `json:"destination"`
	// Planned is every file and the name it would be given, in the order they would be numbered.
	// This is the whole point of stopping: the numbering is what goes wrong, and it is only
	// obvious when you can see it.
	Planned []PlannedEpisode `json:"planned"`
}

// countMismatchFor reports a mismatch worth confirming, or nil when the counts agree — or when
// there is nothing to compare against.
//
// An unknown episode count is not a mismatch. Plenty of entries have none recorded (movies, ONAs,
// anything the provider was unreachable for at queue time), and stopping to ask about a number
// nobody has would put a confirmation in front of every one of them for no reason.
func countMismatchFor(expected int, destination string, planned []PlannedEpisode) *CountMismatch {
	if expected <= 0 || len(planned) == 0 || len(planned) == expected {
		return nil
	}
	return &CountMismatch{
		Expected:    expected,
		Found:       len(planned),
		Destination: destination,
		Planned:     planned,
	}
}

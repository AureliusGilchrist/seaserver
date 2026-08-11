package core

import (
	"time"

	"seanime/internal/api/anilist"
)

// How often a cached collection is brought up to date, by what the entry actually is.
//
// One interval for everything is always wrong in one direction or the other. A weekly refresh is
// generous for a series you finished in 2019 and useless for the one airing tonight; an hourly one
// is right for tonight's episode and, applied to a library of two thousand entries, is a great deal
// of traffic spent re-reading things that have not changed since 2019 — which is the traffic that
// exhausts the AniList budget and makes the pages you are actually looking at slow.
//
// So the interval follows the thing most likely to change:
//
//   - What you are watching now carries a countdown to the next episode, and that countdown has to
//     be right at the moment it reaches zero. Checked hourly.
//   - What has not aired yet has a start date that moves — delays, schedule changes, a date that
//     was a season and becomes a day. Checked every six hours.
//   - Everything else changes about as often as a series gets a new season. Weekly.
//
// Nothing here decides what is *kept*. The cache never expires; these only decide when it is worth
// asking whether it has changed.
const (
	// AiringRefreshInterval covers entries on the Watching list — the countdowns.
	AiringRefreshInterval = time.Hour
	// UnairedRefreshInterval covers entries that have not started airing, which sit in Planning.
	UnairedRefreshInterval = 6 * time.Hour
	// FullRefreshInterval covers everything else.
	FullRefreshInterval = 7 * 24 * time.Hour
)

// RefreshTier is which schedule an entry belongs to.
type RefreshTier string

const (
	// TierAiring — being watched, and airing or about to air. The countdown must be right.
	TierAiring RefreshTier = "airing"
	// TierUnaired — announced but not yet started.
	TierUnaired RefreshTier = "unaired"
	// TierSettled — everything else: finished, dropped, completed, long since aired.
	TierSettled RefreshTier = "settled"
)

// Interval is how often entries in this tier are checked.
func (t RefreshTier) Interval() time.Duration {
	switch t {
	case TierAiring:
		return AiringRefreshInterval
	case TierUnaired:
		return UnairedRefreshInterval
	default:
		return FullRefreshInterval
	}
}

// tierForEntry decides which schedule one list entry belongs to.
//
// Status on the list comes first, and the media's own state settles it. An entry being *watched*
// is what makes its countdown worth an hourly check — a currently-airing series sitting in Dropped
// has a countdown nobody is waiting on.
func tierForEntry(entry *anilist.AnimeListEntry) RefreshTier {
	if entry == nil || entry.GetMedia() == nil {
		return TierSettled
	}

	media := entry.GetMedia()

	// Not out yet: the date can move, and it is the date that matters. This holds wherever the
	// entry is listed, but in practice it is Planning — you cannot be watching something unaired.
	if media.GetStatus() != nil && *media.GetStatus() == anilist.MediaStatusNotYetReleased {
		return TierUnaired
	}

	if entry.GetStatus() == nil {
		return TierSettled
	}

	switch *entry.GetStatus() {
	case anilist.MediaListStatusCurrent, anilist.MediaListStatusRepeating:
		// Being watched. Worth the hourly check only while there is something still to air —
		// a finished series on the Watching list has no next episode to be on time for.
		if media.GetStatus() != nil && *media.GetStatus() == anilist.MediaStatusReleasing {
			return TierAiring
		}
		if media.GetNextAiringEpisode() != nil {
			return TierAiring
		}
		return TierSettled
	case anilist.MediaListStatusPlanning:
		// Planned and already airing: no countdown is being watched, but it is the list things
		// move out of when they start, so it is worth more than the weekly pass.
		if media.GetStatus() != nil && *media.GetStatus() == anilist.MediaStatusReleasing {
			return TierUnaired
		}
		return TierSettled
	default:
		return TierSettled
	}
}

// mediaIDsByTier groups a collection's entries into the schedules they belong to.
//
// The result is what each pass asks AniList about: the hourly pass sends the airing ids, the
// six-hourly pass the unaired ones. Both are a single query over a list of ids rather than a
// collection fetch, which is what makes checking often affordable at all.
func mediaIDsByTier(collection *anilist.AnimeCollection) map[RefreshTier][]int {
	byTier := map[RefreshTier][]int{
		TierAiring:  {},
		TierUnaired: {},
		TierSettled: {},
	}
	if collection == nil || collection.MediaListCollection == nil {
		return byTier
	}

	seen := make(map[int]RefreshTier)
	for _, list := range collection.MediaListCollection.GetLists() {
		if list == nil {
			continue
		}
		for _, entry := range list.GetEntries() {
			if entry == nil || entry.GetMedia() == nil {
				continue
			}
			id := entry.GetMedia().GetID()
			tier := tierForEntry(entry)

			// One id can appear on more than one list (custom lists repeat entries). The most
			// frequent schedule wins: checking too often is a cost, checking too rarely is a
			// countdown that is wrong when it matters.
			if existing, ok := seen[id]; ok {
				if tier.Interval() >= existing.Interval() {
					continue
				}
				// Replace the earlier, less frequent placement.
				byTier[existing] = removeID(byTier[existing], id)
			}
			seen[id] = tier
			byTier[tier] = append(byTier[tier], id)
		}
	}

	return byTier
}

func removeID(ids []int, id int) []int {
	for i, candidate := range ids {
		if candidate == id {
			return append(ids[:i], ids[i+1:]...)
		}
	}
	return ids
}

// anEpisodeWasDueSince reports whether any entry in the collection was expected to air between the
// given time and now.
//
// This is what turns the hourly pass from "refetch every account with anything airing" — which is
// most active accounts, every hour, and a large part of what was spending the rate budget — into
// "refetch when something has actually happened". A countdown running down from six days does not
// need the collection re-read to keep counting; the number it counts from is already cached, and
// the clock is local. What needs a re-read is the moment it reaches zero, because that is when the
// episode count changes and the next airing time is replaced.
//
// TimeUntilAiring is relative to when the collection was fetched, so it is compared against the age
// of the data rather than against the wall clock.
func anEpisodeWasDueSince(collection *anilist.AnimeCollection, fetchedAt time.Time) bool {
	if collection == nil || collection.MediaListCollection == nil {
		return true // nothing to reason about; let the caller refresh
	}
	if fetchedAt.IsZero() {
		return true // unknown age, so the countdowns cannot be trusted
	}

	elapsed := time.Since(fetchedAt)

	for _, list := range collection.MediaListCollection.GetLists() {
		if list == nil {
			continue
		}
		for _, entry := range list.GetEntries() {
			if entry == nil || entry.GetMedia() == nil {
				continue
			}
			if tierForEntry(entry) != TierAiring {
				continue
			}
			next := entry.GetMedia().GetNextAiringEpisode()
			if next == nil {
				continue
			}
			// The episode was due if less time remained than has passed since this was fetched.
			if time.Duration(next.TimeUntilAiring)*time.Second <= elapsed {
				return true
			}
		}
	}

	return false
}

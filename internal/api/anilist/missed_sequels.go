package anilist

import "sort"

// MissedSequel is a show on the user's Completed list whose sequel is out (finished or airing)
// but which the user has not started.
type MissedSequel struct {
	// Media is the completed show.
	Media *BaseAnime `json:"media"`
	// Sequel is the show that follows it.
	Sequel *BaseAnime `json:"sequel"`
	// SequelListStatus is the sequel's status on the user's list, when it is on one. Only PLANNING
	// can appear here: a sequel on any other list is not "missed".
	SequelListStatus *MediaListStatus `json:"sequelListStatus,omitempty"`
}

// FindMissedSequels pairs every completed show with each sequel the user has not got to yet.
//
// withRelations supplies the relations (the plain collection query does not carry them). current,
// when given, is the fresher collection the library renders from; list statuses are read from it
// so that a sequel started since withRelations was fetched drops out straight away. Either way the
// work is pure: no AniList request is made here.
//
// A sequel counts as missed when it has been released (FINISHED or RELEASING) and is either not on
// any list or only on PLANNING. Watching, completed, rewatching, paused and dropped all mean the
// user already knows about it and made a choice, so those are left out.
func FindMissedSequels(withRelations *AnimeCollectionWithRelations, current *AnimeCollection) []*MissedSequel {
	if withRelations == nil {
		return []*MissedSequel{}
	}

	statuses := make(map[int]MediaListStatus)
	for _, list := range withRelations.GetMediaListCollection().GetLists() {
		for _, entry := range list.GetEntries() {
			if st := entryStatus(entry.GetStatus(), list.GetStatus()); st != nil {
				statuses[entry.GetMedia().GetID()] = *st
			}
		}
	}
	if current != nil {
		// The fresher collection wins, including for shows it no longer has at all.
		statuses = make(map[int]MediaListStatus)
		for _, list := range current.GetMediaListCollection().GetLists() {
			for _, entry := range list.GetEntries() {
				if st := entryStatus(entry.GetStatus(), list.GetStatus()); st != nil {
					statuses[entry.GetMedia().GetID()] = *st
				}
			}
		}
	}

	ret := make([]*MissedSequel, 0)
	seenSequels := make(map[int]struct{})

	for _, list := range withRelations.GetMediaListCollection().GetLists() {
		for _, entry := range list.GetEntries() {
			media := entry.GetMedia()
			if media == nil {
				continue
			}
			st, ok := statuses[media.GetID()]
			if !ok || (st != MediaListStatusCompleted && st != MediaListStatusRepeating) {
				continue
			}

			for _, edge := range media.GetRelations().GetEdges() {
				if edge == nil || edge.GetRelationType() == nil || *edge.GetRelationType() != MediaRelationSequel {
					continue
				}
				sequel := edge.GetNode()
				if sequel == nil || sequel.GetStatus() == nil {
					continue
				}
				if s := *sequel.GetStatus(); s != MediaStatusFinished && s != MediaStatusReleasing {
					continue
				}
				if _, dup := seenSequels[sequel.GetID()]; dup {
					continue
				}

				var sequelListStatus *MediaListStatus
				if sst, onList := statuses[sequel.GetID()]; onList {
					if sst != MediaListStatusPlanning {
						continue
					}
					sequelListStatus = &sst
				}

				seenSequels[sequel.GetID()] = struct{}{}
				ret = append(ret, &MissedSequel{
					Media:            media.ToBaseAnime(),
					Sequel:           sequel,
					SequelListStatus: sequelListStatus,
				})
			}
		}
	}

	sort.SliceStable(ret, func(i, j int) bool {
		return ret[i].Media.GetTitleSafe() < ret[j].Media.GetTitleSafe()
	})

	return ret
}

func entryStatus(entry *MediaListStatus, list *MediaListStatus) *MediaListStatus {
	if entry != nil {
		return entry
	}
	return list
}

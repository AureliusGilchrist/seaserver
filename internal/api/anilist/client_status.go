package anilist

import (
	"context"

	"github.com/Yamashou/gqlgenc/clientv2"
)

// updateMediaListEntryStatusDocument changes only the status of a list entry.
//
// The generated UpdateMediaListEntry mutation always sends every variable, and the GraphQL
// client marshals nil pointers as explicit nulls. AniList rejects that outright:
//
//	"scoreRaw": ["The score raw must be an integer."]
//	"progress": ["The progress must be an integer."]
//
// so a status-only change through that mutation fails with a 400 for every entry. Declaring
// a mutation that never mentions scoreRaw or progress is the only way to leave them untouched
// — passing placeholder values instead would overwrite the user's real score and progress.
const updateMediaListEntryStatusDocument = `mutation UpdateMediaListEntryStatus ($mediaId: Int, $status: MediaListStatus) {
	SaveMediaListEntry(mediaId: $mediaId, status: $status) {
		id
	}
}
`

// UpdateMediaListEntryStatus sets an entry's status, leaving score, progress and dates as they are.
func (ac *AnilistClientImpl) UpdateMediaListEntryStatus(ctx context.Context, mediaID *int, status *MediaListStatus, interceptors ...clientv2.RequestInterceptor) (*UpdateMediaListEntry, error) {
	if !ac.IsAuthenticated() {
		return nil, ErrNotAuthenticated
	}
	if mediaID != nil {
		ac.logger.Debug().Int("mediaId", *mediaID).Msg("anilist: Updating media list entry status")
	}

	vars := map[string]any{
		"mediaId": mediaID,
		"status":  status,
	}

	var res UpdateMediaListEntry
	if err := ac.Client.Client.Post(ctx, "UpdateMediaListEntryStatus", updateMediaListEntryStatusDocument, &res, vars, interceptors...); err != nil {
		return nil, err
	}

	return &res, nil
}

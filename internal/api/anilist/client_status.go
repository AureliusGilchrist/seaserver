package anilist

import (
	"context"
	"strings"

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

// buildUpdateMediaListEntryDocument builds a SaveMediaListEntry mutation that declares only the
// variables that are set. A nil pointer in the generated mutation is sent as an explicit null,
// which AniList refuses for scoreRaw and progress (see updateMediaListEntryStatusDocument), so
// leaving a field out of the mutation is the only way to say "don't change it".
func buildUpdateMediaListEntryDocument(mediaID *int, status *MediaListStatus, scoreRaw *int, progress *int, startedAt *FuzzyDateInput, completedAt *FuzzyDateInput) (string, map[string]any) {
	type field struct {
		name, gqlType string
		value         any
		set           bool
	}
	fields := []field{
		{"mediaId", "Int", mediaID, mediaID != nil},
		{"status", "MediaListStatus", status, status != nil},
		{"scoreRaw", "Int", scoreRaw, scoreRaw != nil},
		{"progress", "Int", progress, progress != nil},
		{"startedAt", "FuzzyDateInput", startedAt, startedAt != nil},
		{"completedAt", "FuzzyDateInput", completedAt, completedAt != nil},
	}

	var decls, args []string
	vars := map[string]any{}
	for _, f := range fields {
		if !f.set {
			continue
		}
		decls = append(decls, "$"+f.name+": "+f.gqlType)
		args = append(args, f.name+": $"+f.name)
		vars[f.name] = f.value
	}

	doc := "mutation UpdateMediaListEntry (" + strings.Join(decls, ", ") + ") {\n" +
		"\tSaveMediaListEntry(" + strings.Join(args, ", ") + ") {\n\t\tid\n\t}\n}\n"
	return doc, vars
}

// updateMediaListEntrySetFields runs SaveMediaListEntry with only the non-nil fields.
func (ac *AnilistClientImpl) updateMediaListEntrySetFields(ctx context.Context, mediaID *int, status *MediaListStatus, scoreRaw *int, progress *int, startedAt *FuzzyDateInput, completedAt *FuzzyDateInput, interceptors ...clientv2.RequestInterceptor) (*UpdateMediaListEntry, error) {
	doc, vars := buildUpdateMediaListEntryDocument(mediaID, status, scoreRaw, progress, startedAt, completedAt)
	var res UpdateMediaListEntry
	if err := ac.Client.Client.Post(ctx, "UpdateMediaListEntry", doc, &res, vars, interceptors...); err != nil {
		return nil, err
	}
	return &res, nil
}

package enmasse

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"seanime/internal/connectivity"
)

// ProviderReason is why one provider could not supply a series.
type ProviderReason struct {
	Provider string `json:"provider"`
	// Reason is the short label ("No episodes", "Video source null", ...).
	Reason string `json:"reason"`
	// Detail is the full message.
	Detail string `json:"detail,omitempty"`
}

// The short labels. Every skip and every way a provider can fail has its own.
const (
	ReasonInLibrary         = "In library"
	ReasonDownloading       = "Already downloading"
	ReasonLinedUp           = "Already lined up"
	ReasonNotAired          = "Not aired yet"
	ReasonAdult             = "Adult"
	ReasonNoAniList         = "No AniList entry"
	ReasonNothingToDownload = "Nothing to download"
	ReasonAniListFailed     = "AniList lookup failed"
	ReasonNotFound          = "Not found"
	ReasonSearchFailed      = "Search failed"
	ReasonNoEpisodes        = "No episodes"
	ReasonCountMismatch     = "Episode count mismatch"
	ReasonListDoesNotFit    = "Episode list doesn't fit"
	ReasonVideoSourceNull   = "Video source null"
	ReasonNoEpisodeList     = "No episode list"
	ReasonCouldNotQueue     = "Couldn't queue"
	ReasonRefused           = "Refused (Cloudflare)"
	ReasonNoInternet        = "No internet"
	ReasonNoTitle           = "No title to search"
	ReasonNotOnAnyProvider  = "Not on any provider"
	ReasonTorrent           = "Torrent (SeaDex)"
	ReasonNoTorrent         = "No torrent"
)

var skipLabels = []struct{ prefix, label string }{
	{"already in the library", ReasonInLibrary},
	{"already downloading", ReasonDownloading},
	{"already lined up", ReasonLinedUp},
	{"not aired yet", ReasonNotAired},
	{"adult", ReasonAdult},
	{"no anilist entry", ReasonNoAniList},
	{"nothing to download", ReasonNothingToDownload},
}

var knownProviders = []string{"kickassanime", "anizone", "animeheaven", "animegg", "animepahe", "torrent"}

var (
	countRe    = regexp.MustCompile(`has (\d+) episodes, the series has (\d+)`)
	spellingRe = regexp.MustCompile(`tried (\d+) spellings`)
)

// explainResult turns a series' outcome into a short label and, for a series no provider could
// supply, what each provider said.
func explainResult(err error) (string, []ProviderReason) {
	if err == nil {
		return "", nil
	}
	msg := err.Error()
	lower := strings.ToLower(msg)

	if errors.Is(err, errOnlineSkipped) {
		for _, s := range skipLabels {
			if strings.HasPrefix(lower, s.prefix) {
				return s.label, nil
			}
		}
		return "Skipped", nil
	}
	if strings.HasPrefix(lower, "failed to resolve anilist") {
		if connectivity.IsNetworkError(err) {
			return ReasonNoInternet, nil
		}
		return ReasonAniListFailed, nil
	}
	if connectivity.IsNetworkError(err) {
		return ReasonNoInternet, nil
	}

	// What each provider said, as the search recorded it.
	var nf *notFoundError
	if errors.As(err, &nf) && len(nf.parts) > 0 {
		parts := append([]ProviderReason(nil), nf.parts...)
		return mainReason(parts), parts
	}

	// From the message alone (entries saved before the reasons were recorded):
	// "<provider part>; <provider part>; ... (the torrent keeps downloading)"
	body := msg
	if i := strings.LastIndex(body, " (the torrent"); i >= 0 {
		body = body[:i]
	}
	var parts []ProviderReason
	for _, part := range strings.Split(body, "; ") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		parts = append(parts, ProviderReason{Provider: providerIn(part), Reason: labelFor(part), Detail: part})
	}
	return mainReason(parts), parts
}

func providerIn(s string) string {
	l := strings.ToLower(s)
	best, at := "", -1
	for _, p := range knownProviders {
		// "on <provider>" / "<provider> is" names the provider the sentence is about.
		if i := strings.Index(l, "on "+p); i >= 0 && (at < 0 || i < at) {
			best, at = p, i
		}
		if i := strings.Index(l, p+" is"); i >= 0 && (at < 0 || i < at) {
			best, at = p, i
		}
	}
	return best
}

// labelFor gives one provider's failure its short label.
func labelFor(s string) string {
	l := strings.ToLower(s)
	if strings.HasPrefix(l, "torrent: ") {
		return ReasonNoTorrent
	}
	switch {
	case strings.Contains(l, "refusing this server") || strings.Contains(l, "403") || strings.Contains(l, "cloudflare"):
		return ReasonRefused
	case strings.Contains(l, "could not queue it there"):
		switch {
		case strings.Contains(l, "video source") || strings.Contains(l, "no source") || strings.Contains(l, "no episode server") ||
			strings.Contains(l, "no provider has episodes"):
			return ReasonVideoSourceNull
		case strings.Contains(l, "lists no episodes") || strings.Contains(l, "no episodes found"):
			return ReasonNoEpisodeList
		}
		return ReasonCouldNotQueue
	case strings.Contains(l, "but has no episodes"):
		return ReasonNoEpisodes
	case countRe.MatchString(l):
		m := countRe.FindStringSubmatch(l)
		return fmt.Sprintf("%s (%s vs %s)", ReasonCountMismatch, m[1], m[2])
	case strings.Contains(l, "episode list does not fit"):
		return ReasonListDoesNotFit
	case strings.Contains(l, "no title to search"):
		return ReasonNoTitle
	case strings.Contains(l, "last search error"):
		if strings.Contains(l, "anime not found") || strings.Contains(l, "not found") && strings.Contains(l, "error: anime") {
			return ReasonNotFound
		}
		return ReasonSearchFailed
	case strings.Contains(l, "not found on"):
		if m := spellingRe.FindStringSubmatch(l); m != nil {
			return fmt.Sprintf("%s (%s spellings)", ReasonNotFound, m[1])
		}
		return ReasonNotFound
	case strings.Contains(l, "video source") || strings.Contains(l, "no source"):
		return ReasonVideoSourceNull
	}
	return ReasonNotFound
}

// mainReason is the label of a whole not-found series: the most telling of its providers'.
func mainReason(parts []ProviderReason) string {
	if len(parts) == 0 {
		return ReasonNotFound
	}
	for _, want := range []string{ReasonVideoSourceNull, ReasonNoEpisodeList, ReasonNoEpisodes, ReasonCountMismatch, ReasonListDoesNotFit, ReasonCouldNotQueue, ReasonRefused, ReasonSearchFailed} {
		for _, p := range parts {
			if strings.HasPrefix(p.Reason, want) {
				if len(parts) == 1 {
					return p.Reason
				}
				return want
			}
		}
	}
	if len(parts) > 1 {
		return ReasonNotOnAnyProvider
	}
	return parts[0].Reason
}

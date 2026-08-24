package kitsu_platform

import (
	"context"
	"fmt"
	"sync"

	"seanime/internal/api/kitsu"
)

// ImageSet mirrors the cover-image shape already in use by the seanime UI for AniList anime
// (small/medium/large/original). Kitsu poster/cover are nested objects with the same fields,
// so we surface them under a single name.
type ImageSet struct {
	Small    string `json:"small,omitempty"`
	Medium   string `json:"medium,omitempty"`
	Large    string `json:"large,omitempty"`
	Original string `json:"original,omitempty"`
}

// KitsuPlatform is the user-facing Kitsu layer. Unlike AniListPlatform, it does not implement the
// shared platform.Platform interface — that interface is AniList-shaped (returns anilist.* types),
// and the goal here is parallel, not identical, behavior.
//
// KitsuPlatform wraps a single kitsu.Client instance and exposes the user-facing surface that
// the Kitsu handlers and the Kitsu planning slut need: anime/manga lookup, library CRUD, viewer
// info, stats. Lightweight AniList-fallback methods are also exposed so handlers can degrade
// gracefully when Kitsu is missing data for an obscure title.
type KitsuPlatform struct {
	mu     sync.Mutex
	Client *kitsu.Client

	// mappingSrc holds the cross-id resolver, attached lazily by App init so the platform
	// package never imports the database. nil = mapping resolution disabled.
	mappingSrc *MappingSource

	// Identity fields. Username, UserID and the tokens are cached at construction so handlers
	// can read them without an extra HTTP call. Tokens are also re-injected after automatic
	// refresh to keep the embedded Client in sync with whatever was persisted earlier.
	Username     string
	UserID       string
	Token        string
	RefreshToken string
}

// KitsuPlatformOptions is the constructor argument list. Builder style — every field is optional
// except the client — so callers can construct from a token pair, from a stored KitsuAccount
// row, or from an existing *kitsu.Client.
type KitsuPlatformOptions struct {
	Token        string
	RefreshToken string
	Username     string
	UserID       string
	Client       *kitsu.Client
}

// NewKitsuPlatform returns a KitsuPlatform ready to use. If opts.Client is nil, a new client is
// built with the supplied tokens; if both Client and Token are set, the token wins for whatever
// the client's existing state was. The platform struct holds a pointer to the client, so callers
// who later refresh the token must follow that up with SetToken.
func NewKitsuPlatform(opts KitsuPlatformOptions) *KitsuPlatform {
	c := opts.Client
	if c == nil {
		c = kitsu.NewClient(kitsu.ClientOptions{Token: opts.Token})
	} else if opts.Token != "" {
		c.SetToken(opts.Token)
	}
	return &KitsuPlatform{
		Client:       c,
		Username:     opts.Username,
		UserID:       opts.UserID,
		Token:        opts.Token,
		RefreshToken: opts.RefreshToken,
	}
}

// SetToken updates the bearer token on the embedded Kitsu client. Used after a refresh succeeds
// and the new token was saved to disk; without this call the next request would still use the
// stale token.
func (p *KitsuPlatform) SetToken(token, refreshToken string) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.Token = token
	if refreshToken != "" {
		p.RefreshToken = refreshToken
	}
	if p.Client != nil {
		p.Client.SetToken(token)
	}
}

// ClearCache invalidates any cached data inside the underlying client. Handlers call this when
// a save succeeds and they want subsequent fetches to hit the network.
func (p *KitsuPlatform) ClearCache() {
	if p.Client != nil {
		p.Client.ClearCache()
	}
}

// Close is a no-op kept for symmetry with the AniListPlatform signature.
func (p *KitsuPlatform) Close() {
	if p.Client != nil {
		p.Client.ClearCache()
	}
}

// LibraryEntry describes one row of a user's Kitsu library. It is the "view model" that handlers
// in the Kitsu pipeline use — shaped slightly differently from the raw kitsu.LibraryEntry so it
// lines up with what the frontend already renders for AniList rows. The Status field uses our
// shared status string ("CURRENT", "PLANNING", ...) so the same UI badge logic works for both.
type LibraryEntry struct {
	ID         int      `json:"id"`
	MediaID    int      `json:"mediaId"`
	MediaType  string   `json:"mediaType"` // "anime" or "manga"
	Status     string   `json:"status"`
	Progress   int      `json:"progress"`
	Score      float64  `json:"score"`
	StartedAt  string   `json:"startedAt,omitempty"`
	FinishedAt string   `json:"finishedAt,omitempty"`
	Notes      string   `json:"notes,omitempty"`
	Repeat     int      `json:"repeat"`
	UpdatedAt  string   `json:"updatedAt,omitempty"`
}

// AnimeDetails is a flat Kitsu anime surface that flows up to the UI. It intentionally does not
// match AniList's BaseAnime / AnimeDetailsById_Media shape — Kitsu data is sparser, and forcing it
// into AniList's shape would erase real fields rather than preserve them.
type AnimeDetails struct {
	ID              int                `json:"id"`
	KitsuID         string             `json:"kitsuId"`
	Slug            string             `json:"slug"`
	CanonicalTitle  string             `json:"canonicalTitle"`
	EnglishTitle    string             `json:"englishTitle"`
	JPTitle         string             `json:"jpTitle"`
	Synopsis        string             `json:"synopsis"`
	CoverImage      *ImageSet  `json:"coverImage"`
	BannerImage     string             `json:"bannerImage"`
	StartDate       string             `json:"startDate,omitempty"`
	EndDate         string             `json:"endDate,omitempty"`
	EpisodeCount    int                `json:"episodeCount"`
	EpisodeLength   int                `json:"episodeLength"`
	Status          string             `json:"status"`           // "finished", "current", "upcoming"
	Subtype         string             `json:"subtype"`          // "TV", "movie", "OVA", ...
	AgeRating       string             `json:"ageRating"`
	Genres          []string           `json:"genres"`
	AverageRating   string             `json:"averageRating"`    // Kitsu's "x.xx" string
	PopularityRank  int                `json:"popularityRank"`
	RatingRank      int                `json:"ratingRank"`
	NSFW            bool               `json:"nsfw"`
	AnilistID       int                `json:"anilistId"`
	MalID           int                `json:"malId"`
	YoutubeTrailer  string             `json:"youtubeTrailerId,omitempty"`
}

// MangaDetails is the manga analogue.
type MangaDetails struct {
	ID              int               `json:"id"`
	KitsuID         string            `json:"kitsuId"`
	Slug            string            `json:"slug"`
	CanonicalTitle  string            `json:"canonicalTitle"`
	EnglishTitle    string            `json:"englishTitle"`
	JPTitle         string            `json:"jpTitle"`
	Synopsis        string            `json:"synopsis"`
	PosterImage     *ImageSet `json:"posterImage"`
	CoverImage      *ImageSet `json:"coverImage"`
	StartDate       string            `json:"startDate,omitempty"`
	EndDate         string            `json:"endDate,omitempty"`
	ChapterCount    int               `json:"chapterCount"`
	VolumeCount     int               `json:"volumeCount"`
	Status          string            `json:"status"`
	Subtype         string            `json:"subtype"`
	Genres          []string          `json:"genres"`
	AverageRating   string            `json:"averageRating"`
	PopularityRank  int               `json:"popularityRank"`
	RatingRank      int               `json:"ratingRank"`
	Authors         []string          `json:"authors"`
	Serialization   string            `json:"serialization"`
	AnilistID       int               `json:"anilistId"`
	MalID           int               `json:"malId"`
}

// Viewer is the OAuth viewer's profile record.
type Viewer struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatarUrl"`
	Bio       string `json:"bio,omitempty"`
}

// ViewerStats is a synthesized count of how the user has actually used their library. Kitsu's
// "stats" endpoint is private, so we derive this from a library pagination scan.
type ViewerStats struct {
	Anime     ViewerTypeStats `json:"anime"`
	Manga     ViewerTypeStats `json:"manga"`
	Username  string          `json:"username,omitempty"`
	UserID    string          `json:"userId,omitempty"`
}

// ViewerTypeStats breaks down a single media kind.
type ViewerTypeStats struct {
	Count       int            `json:"count"`
	StatusBreakdown map[string]int `json:"statusBreakdown"`
	MeanScore   float64        `json:"meanScore"`
	EpisodesWatched int        `json:"episodesWatched"`
	ChaptersRead int           `json:"chaptersRead"`
}

// GetViewer returns the authenticated user record. Mirrors `GetCurrentUser` on the underlying
// client but presented in the KitsuPlatform's view shape.
func (p *KitsuPlatform) GetViewer(ctx context.Context) (*Viewer, error) {
	u, err := p.Client.GetCurrentUser(ctx)
	if err != nil {
		return nil, fmt.Errorf("kitsu_platform: GetViewer: %w", err)
	}
	if u == nil {
		return nil, fmt.Errorf("kitsu_platform: empty viewer response")
	}
	out := &Viewer{
		ID:       u.ID,
		Username: u.Attributes.Slug,
	}
	if u.Attributes.Avatars != nil {
		out.AvatarURL = u.Attributes.Avatars.Small
	}
	if u.Attributes.Name != "" {
		out.Username = u.Attributes.Name
	}
	return out, nil
}

// SetUsername is a no-op kept for compatibility with code that does platform-agnostic username
// updates. Kitsu usernames are tied to the slug of the OAuth account, so users cannot rename
// through this client. The method exists so the KitsuPlatform satisfies interface parity with
// AniListPlatform where the parent calls it.
func (p *KitsuPlatform) SetUsername(username string) {
	if username == "" {
		return
	}
	p.Username = username
}

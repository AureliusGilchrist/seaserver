package kitsu

import (
	"encoding/json"
	"time"
)

// JSON:API envelope. Most Kitsu list endpoints return bodies that fit this shape; we keep it
// generic because resource types vary per endpoint (`anime`, `manga`, `users`,
// `library-entries`, ...).
//
// `Data` is the resource(s). `Included` is the optional secondary resources the server decided to
// inline (cover images, genres, etc.). `Meta` and `Links` are paging/bookkeeping.
type Response struct {
	Data     json.RawMessage `json:"data"`
	Included json.RawMessage `json:"included,omitempty"`
	Meta     *Meta           `json:"meta,omitempty"`
	Links    *Links          `json:"links,omitempty"`
}

// Meta holds pagination + count info; Kitsu consolidates two slightly different shapes here
// (`count` for unauthenticated `users/-/library` and the standard `next/prev` for everything else).
type Meta struct {
	Count int `json:"count,omitempty"`
}

// Links carries the next/prev pagination URLs.
type Links struct {
	First string `json:"first,omitempty"`
	Next  string `json:"next,omitempty"`
	Prev  string `json:"prev,omitempty"`
	Last  string `json:"last,omitempty"`
}

// Resource is the JSON:API resource envelope every individual record is wrapped in.
//
// Fields directly mirror the JSON:API spec. The Kitsu-specific fields (`attributes`) live inside
// `attributes` and vary by type — what we store there is a `json.RawMessage` so a single struct
// serves anime, manga, user, library-entry, and cover-image resources without an explosion of
// fields-per-type.
type Resource struct {
	ID            string          `json:"id"`
	Type          string          `json:"type"`
	Attributes    json.RawMessage `json:"attributes"`
	Relationships json.RawMessage `json:"relationships,omitempty"`
}

// Anime mirrors a single Kitsu `anime` resource at its broadest — it is not exhaustive (cover
// images, genres, characters, etc. live in `relationships` as separate resources). We surface
// only what a UI render needs.
type Anime struct {
	ID            string          `json:"id"`
	Type          string          `json:"type"`
	Attributes    AnimeAttributes `json:"attributes"`
	Relationships Relationships   `json:"relationships"`
}

// AnimeAttributes is the typed `attributes` object for an anime. Kitsu uses kebab-case keys, and
// Go's default JSON decoding would map those verbatim — we reproduce them as struct fields the
// UI consumes directly.
type AnimeAttributes struct {
	Slug           string    `json:"slug"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
	Synopsis       string    `json:"synopsis"`
	Description    string    `json:"description"`
	CanonicalTitle string    `json:"canonicalTitle"`
	EnglishTitle   string    `json:"englishTitle,omitempty"`
	RomajiTitle    string    `json:"romajiTitle,omitempty"`
	UserCount      int       `json:"userCount"`
	FavoritesCount int       `json:"favoritesCount"`
	PopularityRank int       `json:"popularityRank"`
	RatingRank     int       `json:"ratingRank"`
	AgeRating      string    `json:"ageRating"`
	AgeRatingGuide string    `json:"ageRatingGuide"`
	Subtype        string    `json:"subtype"`
	Status         string    `json:"status"`
	Tba            string    `json:"tba,omitempty"`
	StartDate      string    `json:"startDate,omitempty"`
	EndDate        string    `json:"endDate,omitempty"`
	EpisodeCount   int       `json:"episodeCount"`
	EpisodeLength  int       `json:"episodeLength"`
	YoutubeVideoID string    `json:"youtubeVideoId,omitempty"`
	Nsfw           bool      `json:"nsfw"`
}

// Relationships is the immediate `relationships` payload for any media-type resource. The
// underlying Resource maps save the resolver from running a second round-trip when all it needs
// is a small pointer to the cover image.
//
// Each field is a JSON:API relationship structure of the form `{data: {id, type}, links: {...}}`.
type Relationships struct {
	Genres    RefList `json:"genres,omitempty"`
	Categories RefList `json:"categories,omitempty"`
	Casting   RefList `json:"casting,omitempty"`
	Installments RefList `json:"installments,omitempty"`
	Mappings  RefList `json:"mappings,omitempty"`
	Reviews   RefList `json:"reviews,omitempty"`
	MediaRelationships RefList `json:"mediaRelationships,omitempty"`
	Characters RefList `json:"characters,omitempty"`
	Productions RefList `json:"productions,omitempty"`
	Staff       RefList `json:"staff,omitempty"`
	Episodes    RefList `json:"episodes,omitempty"`
	AnimeProductions RefList `json:"animeProductions,omitempty"`
	AnimeCastings RefList `json:"animeCastings,omitempty"`
	AnimeStaff  RefList `json:"animeStaff,omitempty"`
	// Manga-specific:
	Chapters   RefList `json:"chapters,omitempty"`
	MangaCharacters RefList `json:"mangaCharacters,omitempty"`
	MangaStaff RefList `json:"mangaStaff,omitempty"`
}

// Ref is a single resource pointer — used where a relationship resolves to one target.
type Ref struct {
	Data *struct {
		ID   string `json:"id"`
		Type string `json:"type"`
	} `json:"data,omitempty"`
	Links map[string]string `json:"links,omitempty"`
}

// RefList is a collection of resource pointers — used where a relationship resolves to many.
type RefList struct {
	Data []struct {
		ID   string `json:"id"`
		Type string `json:"type"`
	} `json:"data,omitempty"`
	Links map[string]string `json:"links,omitempty"`
}

// Manga mirrors an `manga` resource. Title/IDs/episode count have the same shape as Anime.
type Manga struct {
	ID         string          `json:"id"`
	Type       string          `json:"type"`
	Attributes MangaAttributes `json:"attributes"`
}

// MangaAttributes mirrors AnimeAttributes minus anime-only fields (episodeCount -> chapterCount).
type MangaAttributes struct {
	Slug           string    `json:"slug"`
	Synopsis       string    `json:"synopsis"`
	Description    string    `json:"description"`
	CanonicalTitle string    `json:"canonicalTitle"`
	EnglishTitle   string    `json:"englishTitle,omitempty"`
	RomajiTitle    string    `json:"romajiTitle,omitempty"`
	UserCount      int       `json:"userCount"`
	FavoritesCount int       `json:"favoritesCount"`
	PopularityRank int       `json:"popularityRank"`
	RatingRank     int       `json:"ratingRank"`
	AgeRating      string    `json:"ageRating"`
	AgeRatingGuide string    `json:"ageRatingGuide"`
	Subtype        string    `json:"subtype"`
	Status         string    `json:"status"`
	Tba            string    `json:"tba,omitempty"`
	StartDate      string    `json:"startDate,omitempty"`
	EndDate        string    `json:"endDate,omitempty"`
	ChapterCount   int       `json:"chapterCount"`
	VolumeCount    int       `json:"volumeCount"`
	Nsfw           bool      `json:"nsfw"`
}

// User mirrors a single `users` resource.
type User struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"`
	Attributes UserAttributes `json:"attributes"`
}

// UserAttributes holds the Kitsu-public user fields.
type UserAttributes struct {
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
	Name         string    `json:"name"`
	Slug         string    `json:"slug"`
	About        string    `json:"about"`
	Location     string    `json:"location,omitempty"`
	WaifuOrHusbando string `json:"waifuOrHusbando,omitempty"`
	FollowersCount int     `json:"followersCount"`
	FollowingCount int     `json:"followingCount"`
	LifeSpentOnAnime int   `json:"lifeSpentOnAnime"`
	Birthday     string    `json:"birthday,omitempty"`
	Gender       string    `json:"gender,omitempty"`
	Image        *struct {
		URL string `json:"url,omitempty"`
	} `json:"image,omitempty"`
	Avatars *struct {
		Original string `json:"original,omitempty"`
		Large    string `json:"large,omitempty"`
		Medium   string `json:"medium,omitempty"`
		Small    string `json:"small,omitempty"`
		Tiny     string `json:"tiny,omitempty"`
	} `json:"avatars,omitempty"`
}

// LibraryEntry mirrors a Kitsu `libraryEntries` resource.
type LibraryEntry struct {
	ID            string                 `json:"id"`
	Type          string                 `json:"type"`
	Attributes    LibraryEntryAttributes `json:"attributes"`
	// Relationships holds the anime/manga pointer, populated only when the request used
	// `include=anime,manga`. The pointer's id is the Kitsu media id (string int).
	Relationships json.RawMessage `json:"relationships,omitempty"`
}

// LibraryEntryAttributes holds the editable status, progress, score, and notes that live on a
// single library-entry row. Status is `current`, `planned`, `completed`, `on_hold`, `dropped` —
// Kitsu uses underscores whereas AniList uses camelCase PLANNING/CURRENT/etc.
type LibraryEntryAttributes struct {
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
	Status       string    `json:"status"`   // "current", "planned", "completed", "on_hold", "dropped"
	Progress     int       `json:"progress"` // episodes watched or chapters read
	VolumesOwned int       `json:"volumesOwned"`
	RewatchedCount int    `json:"rewatchedCount"`
	Notes        string    `json:"notes,omitempty"`
	Private      bool      `json:"private"`
	Rating       int       `json:"rating"`         // 2-20; Kitsu stores rating ×2 to allow half-points
	RatingTwenty int       `json:"ratingTwenty"`   // alias kept around for serialized compat
	StartedAt    string    `json:"startedAt,omitempty"`
	FinishedAt   string    `json:"finishedAt,omitempty"`
}

// LibraryStatus constants. Kitsu uses snake_case — we expose them as named consts so the callers
// don't need to reach for string literals.
const (
	LibraryStatusCurrent   = "current"
	LibraryStatusPlanned   = "planned"
	LibraryStatusCompleted = "completed"
	LibraryStatusOnHold    = "on_hold"
	LibraryStatusDropped   = "dropped"
)

// LibraryStatusMap converts between Kitsu and AniList status strings so an AniList answer can be
// reused without rewriting the entry.
func LibraryStatusMap(kitsuStatus string) string {
	switch kitsuStatus {
	case LibraryStatusCurrent:
		return "CURRENT"
	case LibraryStatusPlanned:
		return "PLANNING"
	case LibraryStatusCompleted:
		return "COMPLETED"
	case LibraryStatusOnHold:
		return "PAUSED"
	case LibraryStatusDropped:
		return "DROPPED"
	}
	return ""
}

// CoverImage is a small helper that extracts the best Kitsu-supplied image URL out of an included
// resource or an attribute dictionary.
//
// Returns an empty string when no image resource is present.
type CoverImageMeta struct {
	Tiny    string `json:"tiny,omitempty"`
	Small   string `json:"small,omitempty"`
	Medium  string `json:"medium,omitempty"`
	Large   string `json:"large,omitempty"`
	Original string `json:"original,omitempty"`
}

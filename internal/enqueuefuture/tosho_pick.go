package enqueuefuture

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"seanime/internal/api/anilist"
	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/library/anime"
	"seanime/internal/torrents/torrent"
)

// The last resort for the anime en masse downloader, after the streaming sites and SeaDex: a best
// guess on AnimeTosho. Unlike SeaDex nothing here is curated, so the guess is careful — the release
// must be the right series (its name, cleaned of tags, close to one of the anime's titles), its file
// count must cover the episodes (more is fine), it must be seeded, and Dual Audio wins when there is
// one. What it picks is sent to the client without auto-match: it lands in unmatched like any other
// download and waits there to be matched by hand.

// toshoProvider is the torrent provider the best guess searches.
const toshoProvider = "animetosho"

// toshoMinTitleScore is how close a release's cleaned name must be to one of the anime's titles.
const toshoMinTitleScore = 0.78

var (
	toshoBracketRe    = regexp.MustCompile(`\[[^\]]*\]|\([^)]*\)|\{[^}]*\}`)
	toshoNoiseRe      = regexp.MustCompile(`(?i)\b(1080p|720p|480p|2160p|4k|bd|bdrip|blu-?ray|web(-?dl|rip)?|hevc|avc|x26[45]|h\.?26[45]|aac(2\.0)?|flac|opus|ac3|e-?ac-?3|ddp?\d?(\.\d)?|10-?bit|8-?bit|hi10p?|dual[\s._-]*audio|multi[\s._-]*subs?|eng(lish)?[\s._-]*(subs?|dub)?|subbed|dubbed|batch|complete|uncensored|remux|repack|v\d|mkv|mp4)\b`)
	toshoRangeRe      = regexp.MustCompile(`(?i)\b(s\d{1,2}(e\d{1,4})?|season\s*\d+|e?\d{1,4}\s*[-~]\s*e?\d{1,4}|eps?\s*\d+|episodes?\s*\d+)\b`)
	toshoSpaceRe      = regexp.MustCompile(`\s+`)
	toshoSceneGroupRe = regexp.MustCompile(`-[A-Za-z0-9]+(\.(mkv|mp4|avi))?$`)
)

// cleanReleaseTitle keeps the part of a release name that names the anime.
func cleanReleaseTitle(name string) string {
	// Scene-style names (dots, no spaces) end with "-GROUP".
	if !strings.Contains(name, " ") && strings.Contains(name, ".") {
		name = toshoSceneGroupRe.ReplaceAllString(name, "")
	}
	s := toshoBracketRe.ReplaceAllString(name, " ")
	s = strings.NewReplacer("_", " ", ".", " ").Replace(s)
	s = toshoNoiseRe.ReplaceAllString(s, " ")
	s = toshoRangeRe.ReplaceAllString(s, " ")
	// Whatever follows a " - " is usually episode or batch information.
	if i := strings.Index(s, " - "); i > 0 {
		s = s[:i]
	}
	return normalizeForMatch(s)
}

func normalizeForMatch(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
		default:
			b.WriteRune(' ')
		}
	}
	return strings.TrimSpace(toshoSpaceRe.ReplaceAllString(b.String(), " "))
}

// titleScore is how close a cleaned release name is to the closest of the titles, 0..1.
func titleScore(cleaned string, titles []string) float64 {
	best := 0.0
	for _, t := range titles {
		n := normalizeForMatch(t)
		if n == "" || cleaned == "" {
			continue
		}
		score := levenshteinRatio(cleaned, n)
		// "slam dunk" inside "slam dunk the complete series" is still the right series.
		if strings.HasPrefix(cleaned, n+" ") || cleaned == n {
			score = maxFloat(score, 0.95)
		}
		if score > best {
			best = score
		}
	}
	return best
}

func levenshteinRatio(a, b string) float64 {
	ra, rb := []rune(a), []rune(b)
	if len(ra) == 0 && len(rb) == 0 {
		return 1
	}
	prev := make([]int, len(rb)+1)
	cur := make([]int, len(rb)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ra); i++ {
		cur[0] = i
		for j := 1; j <= len(rb); j++ {
			cost := 1
			if ra[i-1] == rb[j-1] {
				cost = 0
			}
			cur[j] = minInt(minInt(prev[j]+1, cur[j-1]+1), prev[j-1]+cost)
		}
		prev, cur = cur, prev
	}
	longest := len(ra)
	if len(rb) > longest {
		longest = len(rb)
	}
	return 1 - float64(prev[len(rb)])/float64(longest)
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxFloat(a, b float64) float64 {
	if a > b {
		return a
	}
	return b
}

func mediaTitles(media *anilist.BaseAnime) []string {
	var out []string
	if media.Title != nil {
		for _, t := range []*string{media.Title.English, media.Title.Romaji, media.Title.UserPreferred} {
			if t != nil && *t != "" {
				out = append(out, *t)
			}
		}
	}
	for _, s := range media.Synonyms {
		if s != nil && *s != "" {
			out = append(out, *s)
		}
	}
	return out
}

// episodesFit reports whether a release's file count covers the anime: a few short of the
// episode count is allowed (missing specials, a recap), more is fine (extras, OVAs bundled in).
func episodesFit(files, episodes int, isShow bool) bool {
	if !isShow {
		return files >= 1
	}
	if files <= 1 {
		return false
	}
	if episodes <= 0 {
		return true
	}
	slack := episodes / 10
	if slack < 1 {
		slack = 1
	}
	return files >= episodes-slack
}

// bestGuessProviders is the order the best guess tries the torrent providers in: AnimeTosho
// first, then every other installed one (SeaDex is the curated step before it, not a guess).
func (r *Repository) bestGuessProviders() []string {
	r.mu.Lock()
	repo := r.torrentRepository
	r.mu.Unlock()
	if repo == nil {
		return nil
	}
	ids := repo.GetAllAnimeProviderExtensionIds()
	sort.Strings(ids)
	out := []string{}
	for _, id := range ids {
		if id == toshoProvider {
			out = append([]string{id}, out...)
		}
	}
	for _, id := range ids {
		if id != toshoProvider && id != autoPickProvider && id != "" && id != torrent.ProviderNone {
			out = append(out, id)
		}
	}
	return out
}

// pickBestGuess tries the best guess on each provider in turn (bestGuessProviders) and returns
// the first that finds a release; when none does, the last pick, its reason listing every one.
func (r *Repository) pickBestGuess(ctx context.Context, media *anilist.BaseAnime, client *http.Client) *AutoPick {
	var reasons []string
	var last *AutoPick
	for _, provider := range r.bestGuessProviders() {
		if ctx.Err() != nil {
			break
		}
		p := r.pickOnProvider(ctx, media, client, provider)
		if p.Torrent != nil {
			return p
		}
		reasons = append(reasons, providerDisplayName(provider)+": "+p.Reason)
		last = p
	}
	if last == nil {
		last = &AutoPick{MediaID: media.ID, Title: media.GetTitleSafe(), Media: media, Reason: "no other torrent provider is installed"}
		return last
	}
	last.Reason = strings.Join(reasons, "; ")
	return last
}

func providerDisplayName(id string) string {
	switch id {
	case "animetosho":
		return "AnimeTosho"
	case "nyaa":
		return "Nyaa"
	case "seadex":
		return "SeaDex"
	}
	return id
}

// pickAnimeTosho makes the best guess on AnimeTosho for an anime.
func (r *Repository) pickAnimeTosho(ctx context.Context, media *anilist.BaseAnime, client *http.Client) *AutoPick {
	return r.pickOnProvider(ctx, media, client, toshoProvider)
}

// pickOnProvider makes the best guess for an anime on one torrent provider.
func (r *Repository) pickOnProvider(ctx context.Context, media *anilist.BaseAnime, client *http.Client, provider string) *AutoPick {
	name := providerDisplayName(provider)
	pick := &AutoPick{MediaID: media.ID, Title: media.GetTitleSafe(), Media: media, Source: provider}
	isShow := isTVShow(media)
	kind := "TV batch"
	if !isShow {
		kind = "movie or special"
	}
	pick.SearchedFor = media.GetRomajiTitleSafe() + " · " + kind + " on " + name

	r.mu.Lock()
	repo := r.torrentRepository
	r.mu.Unlock()
	if repo == nil {
		pick.Reason = "Torrent search is unavailable"
		return pick
	}
	if _, found := repo.GetAnimeProviderExtension(provider); !found {
		pick.Reason = name + " is not installed"
		return pick
	}
	entry := &anime.Entry{MediaId: media.ID, Media: media}
	params, err := r.searchParamsFor(entry, provider)
	if err != nil {
		pick.Reason = err.Error()
		return pick
	}
	if !isShow {
		params.Batch = false
	}
	if err := r.autoPickPacer.wait(ctx); err != nil {
		pick.Reason = "Search was stopped"
		return pick
	}
	data, err := repo.SearchAnime(ctx, torrent.AnimeSearchOptions{
		Provider:      params.Provider,
		Type:          torrent.AnimeSearchType(params.Type),
		Media:         media,
		Query:         params.Query,
		Batch:         params.Batch,
		EpisodeNumber: params.EpisodeNumber,
		BestReleases:  params.BestRelease,
		Resolution:    params.Resolution,
	})
	if err != nil {
		pick.Reason = "search failed: " + err.Error()
		return pick
	}
	if data == nil || len(data.Torrents) == 0 {
		pick.Reason = "nothing for this"
		return pick
	}

	episodes := 0
	if media.Episodes != nil {
		episodes = *media.Episodes
	}
	titles := mediaTitles(media)

	type candidate struct {
		t     *hibiketorrent.AnimeTorrent
		files int
		dual  bool
		score float64
		res   int
	}
	var candidates []candidate
	wrongTitle, tooFew, unseeded := 0, 0, 0
	for _, t := range data.Torrents {
		if t == nil {
			continue
		}
		if t.Seeders < AutoPickMinSeeders {
			unseeded++
			continue
		}
		score := titleScore(cleanReleaseTitle(t.Name), titles)
		if score < toshoMinTitleScore {
			wrongTitle++
			continue
		}
		files := contentsFiles(t, client)
		if !isShow && files < 1 {
			files = 1
		}
		// A batch whose name says it stops short of the series ("Episode 1-20" of 101) is part of
		// it, whatever extras pad its file count.
		if !episodesFit(files, episodes, isShow) || (isShow && namedPartial(t.Name, episodes)) {
			tooFew++
			continue
		}
		candidates = append(candidates, candidate{t: t, files: files, dual: englishDualAudio(t.Name), score: score, res: releaseResolution(t.Name)})
	}
	if len(candidates) == 0 {
		pick.Reason = fmt.Sprintf("no release fits (%d with another title, %d with too few episodes, %d unseeded)", wrongTitle, tooFew, unseeded)
		return pick
	}

	sort.SliceStable(candidates, rankGuesses(len(candidates), func(i int) guessRank {
		c := candidates[i]
		return guessRank{dual: c.dual, seeders: c.t.Seeders, score: c.score, res: c.res, files: c.files}
	}))
	best := candidates[0]
	pick.Torrent = best.t
	pick.Files = best.files
	pick.DualAudio = best.dual
	pick.Flag = "Best guess on " + name + ": not matched automatically, check it in unmatched."
	return pick
}

// guessRank is what the best guess ranks fitting releases by.
type guessRank struct {
	dual    bool // Japanese + English audio
	seeders int
	score   float64
	res     int
	files   int
}

// wellSeeded is the seeder count that makes a release dependable; below it a download may crawl.
const wellSeeded = 5

// rankGuesses orders releases: English dual audio first, then well seeded over barely seeded, the
// closest title (when more than 0.10 closer), the higher resolution, the more files, the more seeders.
func rankGuesses(_ int, at func(i int) guessRank) func(i, j int) bool {
	return func(i, j int) bool {
		a, b := at(i), at(j)
		if a.dual != b.dual {
			return a.dual
		}
		if aw, bw := a.seeders >= wellSeeded, b.seeders >= wellSeeded; aw != bw {
			return aw
		}
		// Titles within 0.10 of each other are the same series spelled differently.
		if d := a.score - b.score; d > 0.10 || d < -0.10 {
			return a.score > b.score
		}
		if a.res != b.res {
			return a.res > b.res
		}
		if a.files != b.files {
			return a.files > b.files
		}
		return a.seeders > b.seeders
	}
}

var (
	// otherDubLanguageRe names a second audio language that is not English ("Jap-Esp", "Ita").
	otherDubLanguageRe = regexp.MustCompile(`(?i)(dual[\s._-]*audio|audio)[^\]\)]*\b(esp|spa|spanish|espanol|español|castellano|latino|ita|italian|fre|fra|french|ger|deu|german|por|portuguese|rus|russian|chi|chinese|kor|korean|hin|hindi|ara|arabic)\b|\b(jap|jpn|japanese)[\s._+-]*(esp|spa|ita|fre|fra|ger|deu|por|rus|lat)\b`)
	englishDubRe       = regexp.MustCompile(`(?i)\b(eng|english)[\s._-]*(dub|audio)\b|\b(jap|jpn|japanese)[\s._+-]*(eng|english)\b|\b(eng|english)[\s._+-]*(jap|jpn|japanese)\b`)
	resolutionRe       = regexp.MustCompile(`(?i)(?:^|[^0-9])(\d{3,4})p\b|\b\d{3,4}x(\d{3,4})\b|\b(4k|uhd)\b`)
	episodeRangeRe     = regexp.MustCompile(`(?i)(seasons?\s*|\bs)?\b(?:ep(?:isodes?)?\.?\s*|e)?(\d{1,4})\s*[-~]\s*(?:ep?\.?\s*)?(\d{1,4})\b`)
)

// englishDualAudio reports a release with Japanese and English audio: dual audio whose second
// language is not something else (Spanish, Italian, ...), or one that names an English dub.
func englishDualAudio(name string) bool {
	if englishDubRe.MatchString(name) && !otherDubLanguageRe.MatchString(name) {
		return true
	}
	return IsDualAudio(name) && !otherDubLanguageRe.MatchString(name)
}

// releaseResolution is the release's vertical resolution as its name gives it (0 when it does not).
func releaseResolution(name string) int {
	best := 0
	for _, m := range resolutionRe.FindAllStringSubmatch(name, -1) {
		v := 0
		switch {
		case m[1] != "":
			fmt.Sscan(m[1], &v)
		case m[2] != "":
			fmt.Sscan(m[2], &v)
		case m[3] != "":
			v = 2160
		}
		if v > best && v <= 4320 {
			best = v
		}
	}
	return best
}

// namedPartial reports a release whose name gives an episode range that stops well short of the
// series ("Episode 1-20" of 101). A season range ("Seasons 1-4") does not count.
func namedPartial(name string, episodes int) bool {
	if episodes <= 1 {
		return false
	}
	slack := episodes / 10
	if slack < 1 {
		slack = 1
	}
	maxEnd := 0
	for _, m := range episodeRangeRe.FindAllStringSubmatch(name, -1) {
		if m[1] != "" {
			continue // a season range
		}
		var from, to int
		fmt.Sscan(m[2], &from)
		fmt.Sscan(m[3], &to)
		// A range of episodes: starts low, ends after it, not a year or a resolution.
		if from > 1 || to <= from || to > 3000 || (to >= 1900 && to <= 2100) {
			continue
		}
		if to > maxEnd {
			maxEnd = to
		}
	}
	return maxEnd > 0 && maxEnd < episodes-slack
}

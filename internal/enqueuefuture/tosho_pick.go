package enqueuefuture

import (
	"context"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"sort"
	"strings"
	"sync"
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
	toshoNoiseRe      = regexp.MustCompile(`(?i)\b(1080p|720p|480p|2160p|4k|bd|bdrip|blu-?ray|web(-?dl|rip)?|hevc|avc|x26[45]|h\.?26[45]|aac(2\.0)?|flac|opus|ac3|e-?ac-?3|ddp?\d?(\.\d)?|10-?bit|8-?bit|hi10p?|dual[\s._-]*audio|multi[\s._-]*subs?|eng(lish)?[\s._-]*(subs?|dub)?|subbed|dubbed|batch|complete|uncensored|remux|repack|v\d|mkv|mp4|480i|576i|1080i|ntsc|pal|dvd(rip|9|5)?|mpeg-?2|r[12]j?)\b`)
	sequelWordRe      = regexp.MustCompile(`\b(the animated series|animated series|remake|reboot|kai|brotherhood|shipp?uu?den|stampede|zoku shou|zoku|crisis|reloaded|next generation)\b`)
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
		// "slam dunk" inside "slam dunk the complete series" is still the right series; "kino no tabi
		// the beautiful world the animated series" (the 2017 remake) is not the 2003 one.
		if cleaned == n || (strings.HasPrefix(cleaned, n+" ") && !otherEntryRe.MatchString(strings.TrimPrefix(cleaned, n+" "))) {
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

// bestGuessOrder is the order the best guess tries the providers it knows, best indexed first.
// Any other installed provider comes after them. SeaDex is the curated step before the guess;
// Sukebei is an adult tracker and never searched.
var bestGuessOrder = []string{
	toshoProvider,
	"seanime-builtin-nyaa",
	"seanime-builtin-nekobt",
	"seanime-builtin-anirena",
	"Tokyo-Toshokan-Provider",
	"acg-rip-provider",
	"seanime-builtin-shanaproject",
	"SubsPlease-Provider",
}

func neverGuessOn(id string) bool {
	l := strings.ToLower(id)
	return id == "" || id == torrent.ProviderNone || id == autoPickProvider || strings.Contains(l, "sukebei")
}

// bestGuessProviders is the order the best guess tries the installed torrent providers in.
func (r *Repository) bestGuessProviders() []string {
	r.mu.Lock()
	repo := r.torrentRepository
	r.mu.Unlock()
	if repo == nil {
		return nil
	}
	installed := map[string]bool{}
	for _, id := range repo.GetAllAnimeProviderExtensionIds() {
		installed[id] = true
	}
	out := []string{}
	for _, id := range bestGuessOrder {
		if installed[id] {
			out = append(out, id)
			delete(installed, id)
		}
	}
	var rest []string
	for id := range installed {
		if !neverGuessOn(id) {
			rest = append(rest, id)
		}
	}
	sort.Strings(rest)
	return append(out, rest...)
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
		reportProgress(ctx, "no streaming provider or SeaDex release: looking for a torrent on "+providerDisplayName(provider))
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
	case "seanime-builtin-nyaa", "nyaa":
		return "Nyaa"
	case "seanime-builtin-nekobt":
		return "NekoBT"
	case "seanime-builtin-anirena":
		return "AniRena"
	case "Tokyo-Toshokan-Provider":
		return "Tokyo Toshokan"
	case "acg-rip-provider":
		return "ACG.RIP"
	case "seanime-builtin-shanaproject":
		return "Shana Project"
	case "SubsPlease-Provider":
		return "SubsPlease"
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
	kind := "batch"
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
	if err := r.searchPacer().wait(ctx); err != nil {
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

	episodes := 0
	if media.Episodes != nil {
		episodes = *media.Episodes
	}
	titles := mediaTitles(media)

	type candidate struct {
		t       *hibiketorrent.AnimeTorrent
		files   int
		dual    bool
		score   float64
		res     int
		bloated bool
	}
	var candidates []candidate
	var otherTitles []string
	seen := map[string]bool{}
	wrongTitle, tooFew, unseeded := 0, 0, 0
	consider := func(torrents []*hibiketorrent.AnimeTorrent) {
		// Counting a release's files downloads its .torrent, so only the best-seeded few of a
		// search are counted: a search can bring back seventy releases of the right title.
		torrents = slices.Clone(torrents)
		sort.SliceStable(torrents, func(i, j int) bool {
			if torrents[i] == nil || torrents[j] == nil {
				return torrents[j] == nil && torrents[i] != nil
			}
			return torrents[i].Seeders > torrents[j].Seeders
		})
		counted := 0
		for _, t := range torrents {
			if t == nil {
				continue
			}
			key := t.InfoHash
			if key == "" {
				key = t.Name
			}
			if seen[key] {
				continue
			}
			seen[key] = true
			if t.Seeders < AutoPickMinSeeders {
				unseeded++
				continue
			}
			score, otherYear := releaseScore(t.Name, titles, media.GetStartYearSafe())
			if score < toshoMinTitleScore || otherYear {
				wrongTitle++
				otherTitles = append(otherTitles, t.Name)
				continue
			}
			if counted >= maxCountedPerSearch {
				continue
			}
			counted++
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
			candidates = append(candidates, candidate{t: t, files: files, dual: englishDualAudio(t.Name), score: score, res: releaseResolution(t.Name),
				bloated: bloatedRelease(files, episodes, isShow)})
		}
	}
	if data != nil {
		consider(data.Torrents)
	}

	// Until a well-seeded English dual-audio release fits, search again under every form of the
	// title: the drawer's search asks for a "batch" (most complete releases never say so), a
	// release may go by the English, romaji or short title, and a newer show of the same name can
	// bury the old one ("Trigun" brings back Trigun Stampede and Trigun Stargaze), so the words
	// that set those apart are left out.
	for _, base := range retryQueries(media) {
		if ctx.Err() != nil || hasWellSeededDual(len(candidates), func(i int) (bool, int) {
			return candidates[i].dual, candidates[i].t.Seeders
		}) {
			break
		}
		query := base
		for _, w := range excludeWords(otherTitles, titles) {
			query += " -" + w
		}
		if r.searchPacer().wait(ctx) != nil {
			break
		}
		retry, err := repo.SearchAnime(ctx, torrent.AnimeSearchOptions{
			Provider: params.Provider,
			Type:     torrent.AnimeSearchTypeSimple,
			Media:    media,
			Query:    query,
		})
		if err == nil && retry != nil {
			consider(retry.Torrents)
			pick.SearchedFor += ", then \"" + query + "\""
		}
	}

	if len(candidates) == 0 {
		if len(seen) == 0 {
			pick.Reason = "nothing for this"
			return pick
		}
		pick.Reason = fmt.Sprintf("no release fits (%d with another title, %d with too few episodes, %d unseeded)", wrongTitle, tooFew, unseeded)
		return pick
	}

	sort.SliceStable(candidates, rankGuesses(len(candidates), func(i int) guessRank {
		c := candidates[i]
		return guessRank{dual: c.dual, seeders: c.t.Seeders, score: c.score, res: c.res, files: c.files, bloated: c.bloated}
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
	bloated bool // far more files than episodes (scans, extras, a whole franchise)
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
		if a.bloated != b.bloated {
			return !a.bloated
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

var (
	// otherEntryRe marks words after a title that name a different entry of the franchise.
	otherEntryRe = regexp.MustCompile(`(?i)\b(season|s\d+|\d+(st|nd|rd|th)|ii+|iv|kai|shipp?uu?den|brotherhood|movies?|films?|gekijou?ban|ova|oad|zero|stampede|animated series|remake|reboot|next generation|new|final|sequel|special|specials|[2-9])\b`)
	yearRe       = regexp.MustCompile(`(?:^|[^0-9])((?:19|20)\d{2})(?:[^0-9]|$)`)
	squareRe     = regexp.MustCompile(`\[[^\]]*\]|\{[^}]*\}`)
	parenYearRe  = regexp.MustCompile(`\(\s*(?:19|20)\d{2}\s*\)`)
)

// releaseScore is how close a release name is to the anime, and whether it names another year
// (another adaptation: Kino no Tabi (2017) is not the 2003 series).
//
// The name is scored twice, without any brackets and keeping what is in parentheses ("Initial D
// (First Stage)"), and the better counts. When the release names the anime's own year, the short
// title before a colon counts too ("Kino no Tabi (2003)" for "Kino no Tabi: The Beautiful World").
func releaseScore(name string, titles []string, year int) (float64, bool) {
	releaseYear := 0
	for _, m := range yearRe.FindAllStringSubmatch(squareRe.ReplaceAllString(name, " "), -1) {
		var y int
		fmt.Sscan(m[1], &y)
		releaseYear = y
		break
	}
	if releaseYear == 0 {
		for _, m := range yearRe.FindAllStringSubmatch(name, -1) {
			var y int
			fmt.Sscan(m[1], &y)
			releaseYear = y
			break
		}
	}
	if year > 0 && releaseYear > 0 && (releaseYear-year > 1 || year-releaseYear > 1) {
		return 0, true
	}

	// Words naming another entry of the franchise anywhere in the name ("- The Animated Series",
	// "Kai", "Stampede") that none of the anime's own titles has: another series.
	if m := sequelWordRe.FindString(normalizeForMatch(squareRe.ReplaceAllString(name, " "))); m != "" {
		inTitles := false
		for _, t := range titles {
			if strings.Contains(normalizeForMatch(t), m) {
				inTitles = true
				break
			}
		}
		if !inTitles {
			return 0, false
		}
	}

	score := 0.0
	// A name can give the title more than once ("Rurouni Kenshin Season 1-3 | Rurouni Kenshin:
	// Meiji Kenkaku Romantan"): each part is scored on its own.
	for _, part := range strings.Split(name, " | ") {
		if s := titleScore(cleanReleaseTitle(part), titles); s > score {
			score = s
		}
		// Keeping the parentheses (but not a year in them).
		kept := parenYearRe.ReplaceAllString(part, " ")
		kept = strings.NewReplacer("(", " ", ")", " ").Replace(squareRe.ReplaceAllString(kept, " "))
		if s := titleScore(cleanReleaseTitle(kept), titles); s > score {
			score = s
		}
	}
	if year > 0 && releaseYear == year {
		var short []string
		for _, t := range titles {
			if i := strings.Index(t, ":"); i > 3 {
				short = append(short, t[:i])
			}
		}
		if s := titleScore(cleanReleaseTitle(name), short); s > score {
			score = s
		}
	}
	return score, false
}

// bloatedRelease reports a release with far more files than the anime has episodes: scans and
// extras by the hundred, or a whole franchise. It still fits, but ranks below a release that is
// the series.
func bloatedRelease(files, episodes int, isShow bool) bool {
	if !isShow || episodes <= 0 {
		return false
	}
	limit := episodes * 2
	if episodes+15 > limit {
		limit = episodes + 15
	}
	return files > limit
}

// excludeWords picks the words that set another show of the same name apart: the first word after
// the anime's own title in the names that were rejected ("stampede" in "Trigun Stampede (01-12)").
// The most frequent come first, at most three, so a retry can leave them out of the search.
func excludeWords(otherNames []string, titles []string) []string {
	// A word of the anime's own titles never goes ("meiji" from the 2023 Rurouni Kenshin remake
	// would also leave out every release of the 1996 series that spells out its full title).
	own := map[string]bool{}
	for _, t := range titles {
		for _, w := range strings.Fields(normalizeForMatch(t)) {
			own[w] = true
		}
	}
	counts := map[string]int{}
	for _, name := range otherNames {
		cleaned := cleanReleaseTitle(name)
		for _, t := range titles {
			n := normalizeForMatch(t)
			if n == "" || !strings.HasPrefix(cleaned, n+" ") {
				continue
			}
			w := strings.Fields(strings.TrimPrefix(cleaned, n+" "))[0]
			if len([]rune(w)) >= 3 && !own[w] && !excludeStopWords[w] && strings.IndexFunc(w, unicode.IsDigit) < 0 {
				counts[w]++
			}
			break
		}
	}
	words := make([]string, 0, len(counts))
	for w := range counts {
		words = append(words, w)
	}
	sort.Slice(words, func(i, j int) bool {
		if counts[words[i]] != counts[words[j]] {
			return counts[words[i]] > counts[words[j]]
		}
		return words[i] < words[j]
	})
	if len(words) > 3 {
		words = words[:3]
	}
	return words
}

// excludeStopWords are words after a title that describe a release, not another show.
var excludeStopWords = map[string]bool{
	"the": true, "and": true, "batch": true, "complete": true, "series": true, "season": true,
	"dual": true, "audio": true, "movie": true, "movies": true, "tv": true, "bd": true, "dvd": true,
	"collection": true, "remastered": true, "uncut": true, "english": true, "dub": true, "dubbed": true,
}

// retryQueries are the title forms a best guess searches again under, most specific first and
// without repeats: romaji, English, then each one's short form before a colon ("Rurouni Kenshin"
// for "Rurouni Kenshin: Meiji Kenkaku Romantan"). At most four, to stay polite to the provider.
func retryQueries(media *anilist.BaseAnime) []string {
	var out []string
	seen := map[string]bool{}
	add := func(s string) {
		q := strings.Join(strings.Fields(strings.ToLower(s)), " ")
		key := normalizeForMatch(q)
		if len([]rune(key)) < 2 || seen[key] || len(out) >= 4 {
			return
		}
		seen[key] = true
		out = append(out, q)
	}
	romaji, english := media.GetRomajiTitleSafe(), ""
	if media.Title != nil && media.Title.English != nil {
		english = *media.Title.English
	}
	add(romaji)
	add(english)
	for _, t := range []string{romaji, english} {
		if i := strings.Index(t, ":"); i > 3 {
			add(t[:i])
		}
	}
	return out
}

// hasWellSeededDual reports whether any fitting release already has English dual audio and enough
// seeders, the best a further search could find.
func hasWellSeededDual(n int, at func(i int) (dual bool, seeders int)) bool {
	for i := 0; i < n; i++ {
		if dual, seeders := at(i); dual && seeders >= wellSeeded {
			return true
		}
	}
	return false
}

// torrentSearchesPerMinute paces the best guess's searches of torrent sites. They are not AniList
// lookups, so they do not wait on that budget (a few a minute, which made a best guess across
// seven providers take ten minutes); the built-in providers also keep their own per-site limits.
const torrentSearchesPerMinute = 30

var (
	searchPacerOnce    sync.Once
	torrentSearchPacer *pacer
)

func (r *Repository) searchPacer() *pacer {
	searchPacerOnce.Do(func() { torrentSearchPacer = newPacer(torrentSearchesPerMinute, 6) })
	return torrentSearchPacer
}

type progressKey struct{}

// WithProgress has a torrent search tell fn which step it is on ("looking for a torrent on Nyaa").
func WithProgress(ctx context.Context, fn func(step string)) context.Context {
	if fn == nil {
		return ctx
	}
	return context.WithValue(ctx, progressKey{}, fn)
}

func reportProgress(ctx context.Context, step string) {
	if fn, ok := ctx.Value(progressKey{}).(func(string)); ok && fn != nil {
		fn(step)
	}
}

// maxCountedPerSearch is how many releases of one search have their files counted.
const maxCountedPerSearch = 15

package enmasse

import (
	"context"
	"errors"
	"path/filepath"
	"seanime/internal/connectivity"
	"strings"
	"testing"
	"time"

	"seanime/internal/api/anilist"
	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"

	"github.com/rs/zerolog"
)

func TestOnlineSearchQueries(t *testing.T) {
	q := onlineSearchQueries([]string{"Attack on Titan Season 2", "Shingeki no Kyojin Season 2", "進撃の巨人"})
	want := []string{"Attack on Titan Season 2", "Shingeki no Kyojin Season 2", "Attack on Titan 2nd Season"}
	for _, w := range want {
		found := false
		for _, v := range q {
			if v == w {
				found = true
			}
		}
		if !found {
			t.Errorf("missing %q in %v", w, q)
		}
	}
	for _, v := range q {
		if strings.Contains(v, "進撃") {
			t.Errorf("a non-Latin title was searched: %q", v)
		}
	}
	if len(q) > onlineMaxVariants {
		t.Errorf("%d variants, cap is %d", len(q), onlineMaxVariants)
	}

	q = onlineSearchQueries([]string{"Re:Zero kara Hajimeru Isekai Seikatsu", "Mobile Suit Gundam: The Witch from Mercury"})
	has := func(s string) bool {
		for _, v := range q {
			if strings.EqualFold(v, s) {
				return true
			}
		}
		return false
	}
	if !has("Mobile Suit Gundam") {
		t.Errorf("franchise name not searched: %v", q)
	}
}

func TestTitleSimilarity(t *testing.T) {
	titles := []string{"Attack on Titan Season 2", "Shingeki no Kyojin Season 2"}
	if s := bestTitleSimilarity("Attack on Titan 2nd Season", titles); s < onlineSureSimilarity {
		t.Errorf("same title, other season spelling: %.2f", s)
	}
	if s := bestTitleSimilarity("Attack on Titan Season 3", titles); s >= onlineSureSimilarity {
		t.Errorf("another season scored as sure: %.2f", s)
	}
	if s := bestTitleSimilarity("Bleach", []string{"BLEACH: Thousand-Year Blood War"}); s >= onlineMinSimilarity {
		t.Errorf("franchise accepted for a sequel: %.2f", s)
	}
	if s := bestTitleSimilarity("Pokémon", []string{"Pokemon"}); s != 1 {
		t.Errorf("accents: %.2f", s)
	}
}

func TestEpisodeCountFits(t *testing.T) {
	cases := []struct {
		item *AnilistMinifiedItem
		got  int
		want bool
	}{
		{&AnilistMinifiedItem{Episodes: 12, Status: "FINISHED", Format: "TV"}, 12, true},
		{&AnilistMinifiedItem{Episodes: 24, Status: "FINISHED", Format: "TV"}, 3, false},
		{&AnilistMinifiedItem{Episodes: 1, Status: "FINISHED", Format: "MOVIE"}, 1, true},
		{&AnilistMinifiedItem{Episodes: 1, Status: "FINISHED", Format: "MOVIE"}, 25, false},
		{&AnilistMinifiedItem{Episodes: 0, Status: "RELEASING", Format: "TV"}, 1100, true},
		{&AnilistMinifiedItem{Episodes: 24, Status: "RELEASING", Format: "TV"}, 5, true},
	}
	for i, c := range cases {
		if got := episodeCountFits(c.item, c.got); got != c.want {
			t.Errorf("case %d: got %v", i, got)
		}
	}
}

// TestProcessAnimeOnline runs one series through a fake provider: the first spelling finds
// nothing, a later one finds the series next to its sequel, and the series is queued whole
// after its match is saved.
func TestProcessAnimeOnline(t *testing.T) {
	onlineRequestGap, onlineSeriesGap = time.Millisecond, time.Millisecond
	defer func() { onlineRequestGap, onlineSeriesGap = 8*time.Second, 30*time.Second }()

	logger := zerolog.Nop()
	d := NewDownloader(&NewDownloaderOptions{Logger: &logger})

	var searched []string
	var mapped, queuedFor string
	hooks := &OnlineHooks{
		InLibrary:       func(int) bool { return false },
		InDownloadQueue: func(int) bool { return false },
		WaitingEpisodes: func() int { return 0 },
		Search: func(provider string, opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
			searched = append(searched, opts.Query)
			if !strings.Contains(strings.ToLower(opts.Query), "kusuriya") {
				return nil, nil
			}
			return []*hibikeonlinestream.SearchResult{
				{ID: "s2", Title: "Kusuriya no Hitorigoto 2nd Season"},
				{ID: "s1", Title: "Kusuriya no Hitorigoto"},
			}, nil
		},
		FindEpisodes: func(provider, id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
			return make([]*hibikeonlinestream.EpisodeDetails, 24), nil
		},
		SaveMapping: func(provider string, mediaId int, providerId string) error {
			mapped = providerId
			return nil
		},
		EnqueueSeries: func(ctx context.Context, provider string, mediaId int) (int, error) {
			queuedFor = provider
			return 24, nil
		},
	}

	item := &AnilistMinifiedItem{ID: 161645, TitleEnglish: "The Apothecary Diaries", TitleRomaji: "Kusuriya no Hitorigoto",
		Episodes: 24, Status: "FINISHED", Format: "TV"}
	match, err := d.findOnProvider(context.Background(), hooks, OnlineProvider, item, 2023)
	if err != nil {
		t.Fatal(err)
	}
	if match.ID != "s1" {
		t.Fatalf("matched %q (%s)", match.ID, match.Title)
	}
	if len(searched) < 2 || searched[0] != "The Apothecary Diaries" {
		t.Fatalf("searched %v", searched)
	}

	// The whole pipeline, from an offline database entry.
	d.resolveOverride = func(ctx context.Context, it *AnimeOfflineItem) (*AnilistMinifiedItem, error) { return item, nil }
	if err := d.processAnimeOnline(context.Background(), hooks, &AnimeOfflineItem{Title: "Kusuriya no Hitorigoto", AnilistID: 161645}); err != nil {
		t.Fatal(err)
	}
	if mapped != "s1" || queuedFor != OnlineProvider {
		t.Fatalf("mapped %q, queued with %q", mapped, queuedFor)
	}
	if got := d.GetStatus().Details.EpisodesQueued; got != 24 {
		t.Fatalf("episodes queued: %d", got)
	}

	// Already in the library: skipped without a single search.
	searched = nil
	hooks.InLibrary = func(int) bool { return true }
	err = d.processAnimeOnline(context.Background(), hooks, &AnimeOfflineItem{Title: "x", AnilistID: 161645})
	if !errors.Is(err, errOnlineSkipped) || len(searched) != 0 {
		t.Fatalf("library series: err %v, searches %d", err, len(searched))
	}
}

// TestTorrentSeriesFirst: a series still downloading as a torrent is tried before the database,
// and once it is queued online its torrents are handed over.
func TestTorrentSeriesFirst(t *testing.T) {
	onlineRequestGap, onlineSeriesGap = time.Millisecond, time.Millisecond
	defer func() { onlineRequestGap, onlineSeriesGap = 8*time.Second, 30*time.Second }()

	logger := zerolog.Nop()
	d := NewDownloader(&NewDownloaderOptions{Logger: &logger})
	d.resolveOverride = func(ctx context.Context, it *AnimeOfflineItem) (*AnilistMinifiedItem, error) {
		return &AnilistMinifiedItem{ID: it.AnilistID, TitleRomaji: it.Title, Episodes: 12, Status: "FINISHED", Format: "TV"}, nil
	}
	var tookOver []int
	hooks := &OnlineHooks{
		InLibrary: func(int) bool { return false },
		Search: func(provider string, opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
			return []*hibikeonlinestream.SearchResult{{ID: "x", Title: opts.Query}}, nil
		},
		FindEpisodes: func(provider, id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
			return make([]*hibikeonlinestream.EpisodeDetails, 12), nil
		},
		EnqueueSeries: func(ctx context.Context, provider string, mediaId int) (int, error) { return 12, nil },
		TorrentSeries: func() []TorrentSeries {
			return []TorrentSeries{{MediaId: 7, Title: "Sousou no Frieren"}, {MediaId: 9, Title: ""}}
		},
		TakeOverTorrents: func(mediaId int) { tookOver = append(tookOver, mediaId) },
	}
	d.processTorrentSeries(context.Background(), hooks)
	if len(tookOver) != 2 || tookOver[0] != 7 {
		t.Fatalf("took over %v", tookOver)
	}
	if st := d.GetStatus(); len(st.DownloadedAnime) != 2 {
		t.Fatalf("queued %v", st.DownloadedAnime)
	}
}

// TestBackupProvider: a series Kickassanime does not have is queued from AnimeHeaven, but a
// series still downloading as a torrent is never handed to the backup.
func TestBackupProvider(t *testing.T) {
	onlineRequestGap, onlineSeriesGap = time.Millisecond, time.Millisecond
	defer func() { onlineRequestGap, onlineSeriesGap = 8*time.Second, 30*time.Second }()

	logger := zerolog.Nop()
	d := NewDownloader(&NewDownloaderOptions{Logger: &logger})
	d.resolveOverride = func(ctx context.Context, it *AnimeOfflineItem) (*AnilistMinifiedItem, error) {
		return &AnilistMinifiedItem{ID: it.AnilistID, TitleRomaji: "Mushishi", Episodes: 26, Status: "FINISHED", Format: "TV"}, nil
	}

	var searchedOn []string
	var queuedOn string
	tookOver := false
	hooks := &OnlineHooks{
		Search: func(provider string, opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
			searchedOn = append(searchedOn, provider)
			if provider == BackupProvider {
				return []*hibikeonlinestream.SearchResult{{ID: "m", Title: "Mushishi"}}, nil
			}
			return nil, nil
		},
		FindEpisodes: func(provider, id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
			return make([]*hibikeonlinestream.EpisodeDetails, 26), nil
		},
		EnqueueSeries: func(ctx context.Context, provider string, mediaId int) (int, error) {
			queuedOn = provider
			return 26, nil
		},
		HasTorrent:       func(int) bool { return false },
		TakeOverTorrents: func(int) { tookOver = true },
	}

	if err := d.processAnimeOnline(context.Background(), hooks, &AnimeOfflineItem{Title: "Mushishi", AnilistID: 457}); err != nil {
		t.Fatal(err)
	}
	if queuedOn != BackupProvider || tookOver {
		t.Fatalf("queued on %q, took over a torrent: %v", queuedOn, tookOver)
	}
	if searchedOn[0] != OnlineProvider {
		t.Fatalf("searched %v: Kickassanime must come first", searchedOn)
	}
	// Kickassanime, AniZone, AnimeHeaven, AnimePahe.
	firstAt := func(p string) int {
		for i, q := range searchedOn {
			if q == p {
				return i
			}
		}
		return -1
	}
	// AnimeHeaven has it here, so AnimePahe, last, is never searched.
	if firstAt("animepahe") >= 0 {
		t.Fatalf("searched %v: AnimePahe must come after AnimeHeaven", searchedOn)
	}
	order := []string{"kickassanime", "anizone", BackupProvider}
	for i := 1; i < len(order); i++ {
		if prev, cur := firstAt(order[i-1]), firstAt(order[i]); prev < 0 || cur < 0 || prev > cur {
			t.Fatalf("searched %v: want the order %v", searchedOn, order)
		}
	}

	// The same series with a torrent downloading: Kickassanime only, and the torrent is left alone.
	searchedOn, queuedOn = nil, ""
	hooks.HasTorrent = func(int) bool { return true }
	err := d.processAnimeOnline(context.Background(), hooks, &AnimeOfflineItem{Title: "Mushishi", AnilistID: 457})
	if err == nil || queuedOn != "" || tookOver {
		t.Fatalf("torrent series: err %v, queued on %q, took over %v", err, queuedOn, tookOver)
	}
	for _, p := range searchedOn {
		if p == BackupProvider {
			t.Fatal("a torrent series was searched on the backup provider")
		}
	}
	// The torrent has stalled: now the backup may take it over.
	searchedOn, queuedOn = nil, ""
	hooks.TorrentStalled = func(int) bool { return true }
	if err := d.processAnimeOnline(context.Background(), hooks, &AnimeOfflineItem{Title: "Mushishi", AnilistID: 457}); err != nil {
		t.Fatal(err)
	}
	if queuedOn != BackupProvider || !tookOver {
		t.Fatalf("stalled torrent series: queued on %q, took over %v", queuedOn, tookOver)
	}
}

// TestResumeKeepsTheRecord: pausing and resuming (also across a server restart) keeps what the
// run did, and continues at the next series rather than stepping back.
func TestResumeKeepsTheRecord(t *testing.T) {
	prev := AnimeProgressFilePath
	AnimeProgressFilePath = filepath.Join(t.TempDir(), "progress.json")
	defer func() { AnimeProgressFilePath = prev }()

	logger := zerolog.Nop()
	d := NewDownloader(&NewDownloaderOptions{Logger: &logger})
	d.downloadedAnime = []string{"Frieren"}
	d.failedAnime = []string{"Texhnolyze"}
	d.skippedCount = 7
	d.details.EpisodesQueued = 28
	d.recent = []ActivityEntry{{Title: "Frieren", Result: "queued", Episodes: 28}}
	d.torrentDone = map[int]bool{26: true}
	d.saveCurrentProgress(1285)

	// A new downloader, as after a restart.
	p := NewDownloader(&NewDownloaderOptions{Logger: &logger}).loadProgress()
	if p == nil || p.NextIndex != 1285 || p.SkippedCount != 7 || p.EpisodesQueued != 28 ||
		len(p.Recent) != 1 || len(p.TorrentDone) != 1 || p.TorrentDone[0] != 26 ||
		len(p.DownloadedAnime) != 1 || len(p.FailedAnime) != 1 {
		t.Fatalf("progress not kept: %+v", p)
	}
}

func TestMatchOnProvider(t *testing.T) {
	onlineRequestGap = time.Millisecond
	defer func() { onlineRequestGap = 8 * time.Second }()

	english, romaji := "Ghost Hound", "Shinreigari"
	eps := 22
	status := anilist.MediaStatusFinished
	format := anilist.MediaFormatTv
	media := &anilist.BaseAnime{ID: 3, Title: &anilist.BaseAnime_Title{English: &english, Romaji: &romaji}, Episodes: &eps, Status: &status, Format: &format}

	logger := zerolog.Nop()
	hooks := &OnlineHooks{
		Search: func(provider string, opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
			if opts.Query == "Shinreigari" {
				return []*hibikeonlinestream.SearchResult{{ID: "sg", Title: "Shinreigari"}}, nil
			}
			return nil, nil
		},
		FindEpisodes: func(provider, id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
			return make([]*hibikeonlinestream.EpisodeDetails, 22), nil
		},
	}
	id, _, err := MatchOnProvider(context.Background(), &logger, hooks, BackupProvider, media)
	if err != nil || id != "sg" {
		t.Fatalf("id %q err %v", id, err)
	}
	hooks.Search = func(string, hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
		return nil, nil
	}
	if _, _, err := MatchOnProvider(context.Background(), &logger, hooks, BackupProvider, media); err == nil {
		t.Fatal("a series the provider does not have was matched")
	}
}

// TestPauseSavesPlaceAtOnce: Pause writes the place straight away (the page offers Resume only
// when it exists), and a Stop is not undone by the run writing its place as it winds down.
func TestPauseSavesPlaceAtOnce(t *testing.T) {
	prev := AnimeProgressFilePath
	AnimeProgressFilePath = filepath.Join(t.TempDir(), "progress.json")
	defer func() { AnimeProgressFilePath = prev }()

	logger := zerolog.Nop()
	d := NewDownloader(&NewDownloaderOptions{Logger: &logger})
	d.isRunning = true
	d.resumeIndex = 42
	d.skippedCount = 3
	d.recent = []ActivityEntry{{Title: "Frieren", Result: "queued"}}
	d.Stop(true)
	p := d.loadProgress()
	if p == nil || p.NextIndex != 42 || p.SkippedCount != 3 || len(p.Recent) != 1 {
		t.Fatalf("pause did not save the place: %+v", p)
	}

	d.isRunning = true
	d.Stop(false)
	d.saveCurrentProgress(43) // the run winding down
	if d.loadProgress() != nil {
		t.Fatal("a stopped run wrote its place back")
	}
}

// TestInterruptedRunIsRemembered: a run going when the server stops is resumed on the next
// start; a paused one is not.
func TestInterruptedRunIsRemembered(t *testing.T) {
	prev := AnimeProgressFilePath
	AnimeProgressFilePath = filepath.Join(t.TempDir(), "progress.json")
	defer func() { AnimeProgressFilePath = prev }()

	logger := zerolog.Nop()
	d := NewDownloader(&NewDownloaderOptions{Logger: &logger})
	d.isRunning = true
	d.saveCurrentProgress(5)
	if !NewDownloader(&NewDownloaderOptions{Logger: &logger}).WasInterrupted() {
		t.Fatal("a running run was not remembered")
	}
	d.Stop(true)
	if NewDownloader(&NewDownloaderOptions{Logger: &logger}).WasInterrupted() {
		t.Fatal("a paused run would be restarted")
	}
}

// TestBlockedProviderFailsFast: a provider refusing the server (403) is asked once, not once per
// spelling, and is skipped for the next series too.
func TestBlockedProviderFailsFast(t *testing.T) {
	onlineRequestGap = time.Millisecond
	defer func() { onlineRequestGap = 8 * time.Second }()
	defer func() { providerBlocksMu.Lock(); providerBlocks = map[string]time.Time{}; providerBlocksMu.Unlock() }()

	logger := zerolog.Nop()
	d := NewDownloader(&NewDownloaderOptions{Logger: &logger})
	calls := 0
	hooks := &OnlineHooks{Search: func(string, hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
		calls++
		return nil, errors.New("animepahe: search failed: animepahe: unexpected status 403 Forbidden")
	}}
	item := &AnilistMinifiedItem{ID: 1, TitleRomaji: "Mushishi", TitleEnglish: "Mushi-Shi", Episodes: 26}
	if _, err := d.findOnProvider(context.Background(), hooks, "animepahe", item, 0); !errors.Is(err, ErrProviderBlocked) || calls != 1 {
		t.Fatalf("err %v after %d searches", err, calls)
	}
	if _, err := d.findOnProvider(context.Background(), hooks, "animepahe", item, 0); !errors.Is(err, ErrProviderBlocked) || calls != 1 {
		t.Fatalf("a blocked provider was searched again: err %v, %d searches", err, calls)
	}
}

// TestWaitsForTheInternet: while offline a series is held, not recorded as not found; once the
// connection is back it is handled as usual.
func TestWaitsForTheInternet(t *testing.T) {
	onlineRequestGap, onlineSeriesGap = time.Millisecond, time.Millisecond
	defer func() { onlineRequestGap, onlineSeriesGap = 8*time.Second, 30*time.Second }()
	prevPoll := connectivity.WaitOnlinePoll
	connectivity.WaitOnlinePoll = 10 * time.Millisecond
	defer func() { connectivity.WaitOnlinePoll = prevPoll; connectivity.SetForcedOffline(false) }()

	logger := zerolog.Nop()
	d := NewDownloader(&NewDownloaderOptions{Logger: &logger})
	d.resolveOverride = func(ctx context.Context, it *AnimeOfflineItem) (*AnilistMinifiedItem, error) {
		return &AnilistMinifiedItem{ID: it.AnilistID, TitleRomaji: "Mushishi", Episodes: 26, Status: "FINISHED", Format: "TV"}, nil
	}
	queued := false
	hooks := &OnlineHooks{
		Search: func(provider string, opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
			return []*hibikeonlinestream.SearchResult{{ID: "m", Title: "Mushishi"}}, nil
		},
		FindEpisodes: func(provider, id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
			return make([]*hibikeonlinestream.EpisodeDetails, 26), nil
		},
		EnqueueSeries: func(ctx context.Context, provider string, mediaId int) (int, error) {
			queued = true
			return 26, nil
		},
	}

	connectivity.SetForcedOffline(true)
	done := make(chan error, 1)
	go func() {
		done <- d.processWhileOnline(context.Background(), hooks, &AnimeOfflineItem{Title: "Mushishi", AnilistID: 457})
	}()
	select {
	case err := <-done:
		t.Fatalf("returned while offline: %v", err)
	case <-time.After(150 * time.Millisecond):
	}
	connectivity.SetForcedOffline(false)
	select {
	case err := <-done:
		if err != nil || !queued {
			t.Fatalf("after the connection came back: err %v, queued %v", err, queued)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("did not continue once back online")
	}
}

// TestNextProviderWhenQueueingFails: a provider that has the series but cannot supply it (no
// playable source) does not end the search; the next provider is tried.
func TestNextProviderWhenQueueingFails(t *testing.T) {
	onlineRequestGap, onlineSeriesGap = time.Millisecond, time.Millisecond
	defer func() { onlineRequestGap, onlineSeriesGap = 8*time.Second, 30*time.Second }()

	logger := zerolog.Nop()
	d := NewDownloader(&NewDownloaderOptions{Logger: &logger})
	d.resolveOverride = func(ctx context.Context, it *AnimeOfflineItem) (*AnilistMinifiedItem, error) {
		return &AnilistMinifiedItem{ID: it.AnilistID, TitleRomaji: "Mushishi", Episodes: 26, Status: "FINISHED", Format: "TV"}, nil
	}
	var tried []string
	queuedOn := ""
	hooks := &OnlineHooks{
		Search: func(provider string, opts hibikeonlinestream.SearchOptions) ([]*hibikeonlinestream.SearchResult, error) {
			return []*hibikeonlinestream.SearchResult{{ID: "m", Title: "Mushishi"}}, nil
		},
		FindEpisodes: func(provider, id string) ([]*hibikeonlinestream.EpisodeDetails, error) {
			return make([]*hibikeonlinestream.EpisodeDetails, 26), nil
		},
		EnqueueSeries: func(ctx context.Context, provider string, mediaId int) (int, error) {
			tried = append(tried, provider)
			if provider == OnlineProvider {
				return 0, errors.New("no source found for episode: video source not found")
			}
			queuedOn = provider
			return 26, nil
		},
	}
	if err := d.processAnimeOnline(context.Background(), hooks, &AnimeOfflineItem{Title: "Mushishi", AnilistID: 457}); err != nil {
		t.Fatal(err)
	}
	if len(tried) != 2 || tried[0] != OnlineProvider || queuedOn != BackupProviders[0] {
		t.Fatalf("tried %v, queued on %q", tried, queuedOn)
	}
}

// TestReadyListQueuesInOrderWhenThereIsRoom: series looked up while the queue was full wait in
// the ready list, and are queued in order, up to the limit, once there is room.
func TestReadyListQueuesInOrderWhenThereIsRoom(t *testing.T) {
	onlineRequestGap = time.Millisecond
	defer func() { onlineRequestGap = 8 * time.Second }()

	logger := zerolog.Nop()
	d := NewDownloader(&NewDownloaderOptions{Logger: &logger})
	waiting := onlineMaxWaitingSeries // full
	var queued []int
	hooks := &OnlineHooks{
		WaitingSeries: func() int { return waiting },
		EnqueueSeries: func(ctx context.Context, provider string, mediaId int) (int, error) {
			queued = append(queued, mediaId)
			waiting++
			return 12, nil
		},
	}
	for _, id := range []int{1, 2, 3} {
		d.ready = append(d.ready, &ReadySeries{Title: "S", Resolved: AnilistMinifiedItem{ID: id}, Provider: OnlineProvider, Match: providerMatch{ID: "x"}})
	}
	saves := 0
	save := func() { saves++ }

	if err := d.drainReady(context.Background(), hooks, false, save); err != nil || len(queued) != 0 {
		t.Fatalf("queued %v while the queue was full (err %v)", queued, err)
	}
	waiting = onlineMaxWaitingSeries - 2 // room for two
	if err := d.drainReady(context.Background(), hooks, false, save); err != nil {
		t.Fatal(err)
	}
	if len(queued) != 2 || queued[0] != 1 || queued[1] != 2 || d.readyCount() != 1 || saves != 2 {
		t.Fatalf("queued %v, %d left, %d saves", queued, d.readyCount(), saves)
	}
}

// TestReadyListIsSaved: the lined-up series survive a pause or a server restart.
func TestReadyListIsSaved(t *testing.T) {
	prev := AnimeProgressFilePath
	AnimeProgressFilePath = filepath.Join(t.TempDir(), "progress.json")
	defer func() { AnimeProgressFilePath = prev }()

	logger := zerolog.Nop()
	d := NewDownloader(&NewDownloaderOptions{Logger: &logger})
	d.ready = []*ReadySeries{{Title: "Mushishi", Resolved: AnilistMinifiedItem{ID: 457}, Provider: "anizone", Match: providerMatch{ID: "m", Title: "Mushishi"}, Rest: []string{"animeheaven"}}}
	d.isRunning = true
	d.Stop(true)
	p := NewDownloader(&NewDownloaderOptions{Logger: &logger}).loadProgress()
	if p == nil || len(p.Ready) != 1 || p.Ready[0].Resolved.ID != 457 || p.Ready[0].Match.ID != "m" || len(p.Ready[0].Rest) != 1 {
		t.Fatalf("ready list not kept: %+v", p)
	}
}

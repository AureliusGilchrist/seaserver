package anime

import (
	"path/filepath"
	"testing"

	"seanime/internal/api/anilist"

	"github.com/samber/lo"
)

// The point of remembering: a card that has once been described must not go blank because a later
// lookup was rate-limited or cancelled.
func TestLocalEntryMediaMemory(t *testing.T) {
	reset := func() {
		localEntryMedia.Lock()
		localEntryMedia.byID = make(map[int]*anilist.BaseAnime)
		localEntryMedia.Unlock()
	}

	t.Run("a described anime is remembered", func(t *testing.T) {
		reset()
		// Romaji as well as UserPreferred: GetTitleSafe reads English then Romaji, so a media
		// carrying only a preferred title reads as untitled — which is what a real fetch never
		// produces and a hand-built fixture easily does.
		media := &anilist.BaseAnime{ID: 5, Title: &anilist.BaseAnime_Title{
			UserPreferred: lo.ToPtr("Some Show"),
			Romaji:        lo.ToPtr("Some Show"),
		}}
		rememberLocalEntryMedia(5, media)

		got := recallLocalEntryMedia(5)
		if got == nil || got.GetTitleSafe() != "Some Show" {
			t.Errorf("got %v, want the remembered media", got)
		}
	})

	t.Run("nothing is remembered for an anime never seen", func(t *testing.T) {
		reset()
		if got := recallLocalEntryMedia(404); got != nil {
			t.Errorf("got %v, want nil", got)
		}
	})

	t.Run("junk is not remembered", func(t *testing.T) {
		reset()
		rememberLocalEntryMedia(0, &anilist.BaseAnime{ID: 0})
		rememberLocalEntryMedia(7, nil)

		localEntryMedia.Lock()
		size := len(localEntryMedia.byID)
		localEntryMedia.Unlock()
		if size != 0 {
			t.Errorf("stored %d entries, want 0", size)
		}
	})
}

func TestFolderTitleForLocalFiles(t *testing.T) {
	lf := func(path string) *LocalFile {
		return &LocalFile{Path: filepath.FromSlash(path)}
	}

	tests := []struct {
		name string
		lfs  []*LocalFile
		want string
	}{
		{
			name: "named after the folder holding the episodes",
			lfs:  []*LocalFile{lf("/zroot/Soul/Otaku Media/Anime/Some Show/Some Show - Episode 001.mkv")},
			want: "Some Show",
		},
		{
			name: "a nil or pathless file is skipped, not fatal",
			lfs:  []*LocalFile{nil, lf(""), lf("/zroot/Soul/Otaku Media/Anime/Another Show/ep.mkv")},
			want: "Another Show",
		},
		{
			name: "nothing to go on",
			lfs:  []*LocalFile{},
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := folderTitleForLocalFiles(tt.lfs); got != tt.want {
				t.Errorf("got %q, want %q", got, tt.want)
			}
		})
	}
}

package handlers

import (
	"testing"

	"seanime/internal/library/anime"
)

func TestLocalFileEpisode(t *testing.T) {
	unhydrated := &anime.LocalFile{MediaId: 99699, ParsedData: &anime.LocalFileParsedData{Episode: "010"},
		Metadata: &anime.LocalFileMetadata{}}
	if got := localFileEpisode(unhydrated); got != 10 {
		t.Fatalf("unhydrated: got %d", got)
	}
	special := &anime.LocalFile{MediaId: 1, ParsedData: &anime.LocalFileParsedData{Episode: "3"},
		Metadata: &anime.LocalFileMetadata{Episode: 0, Type: anime.LocalFileTypeSpecial}}
	if got := localFileEpisode(special); got != 0 {
		t.Fatalf("special: got %d", got)
	}
	main := &anime.LocalFile{MediaId: 1, ParsedData: &anime.LocalFileParsedData{Episode: "3"},
		Metadata: &anime.LocalFileMetadata{Episode: 4, Type: anime.LocalFileTypeMain}}
	if got := localFileEpisode(main); got != 4 {
		t.Fatalf("main: got %d", got)
	}
	unmatched := &anime.LocalFile{ParsedData: &anime.LocalFileParsedData{Episode: "3"}}
	if got := localFileEpisode(unmatched); got != 0 {
		t.Fatalf("unmatched: got %d", got)
	}
}

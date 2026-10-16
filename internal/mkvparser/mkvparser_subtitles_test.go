package mkvparser

import "testing"

func TestDetectSubtitleTypeFromShortSRT(t *testing.T) {
	content := "1\n00:00:01,000 --> 00:00:02,000\nA single subtitle cue.\n"

	if got := DetectSubtitleType(content); got != SubtitleTypeSRT {
		t.Fatalf("DetectSubtitleType() = %d, want %d", got, SubtitleTypeSRT)
	}
}

func TestDetectSubtitleTypePrefersWebVTTHeader(t *testing.T) {
	content := "WEBVTT\n\n" +
		"00:00:01.000 --> 00:00:02.000\nOne\n\n" +
		"00:00:03.000 --> 00:00:04.000\nTwo\n\n" +
		"00:00:05.000 --> 00:00:06.000\nThree\n\n" +
		"00:00:07.000 --> 00:00:08.000\nFour\n\n" +
		"00:00:09.000 --> 00:00:10.000\nFive\n\n" +
		"00:00:11.000 --> 00:00:12.000\nSix\n"

	if got := DetectSubtitleType(content); got != SubtitleTypeWEBVTT {
		t.Fatalf("DetectSubtitleType() = %d, want %d", got, SubtitleTypeWEBVTT)
	}
}

func TestDetectSubtitleTypeWithUTF8BOM(t *testing.T) {
	content := "\uFEFF[Script Info]\nTitle: Embedded subtitles\n"

	if got := DetectSubtitleType(content); got != SubtitleTypeASS {
		t.Fatalf("DetectSubtitleType() = %d, want %d", got, SubtitleTypeASS)
	}
}

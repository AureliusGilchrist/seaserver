package mediastream

import (
	"strings"
	"testing"
)

func TestReplaceCueAss(t *testing.T) {
	in := strings.Join([]string{
		"[Script Info]",
		"Title: x",
		"",
		"[Events]",
		"Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
		`Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\an8}Hello, there\Nfriend`,
		`Dialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,Hello, there\Nfriend`,
	}, "\r\n")
	out, ok := ReplaceCue(in, "ass", 5, 6, `Hello, there\Nfriend`, "Hi there\nbuddy")
	if !ok {
		t.Fatal("cue not found")
	}
	if !strings.Contains(out, `Dialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,Hi there\Nbuddy`) {
		t.Fatalf("edit missing:\n%s", out)
	}
	if !strings.Contains(out, `{\an8}Hello, there\Nfriend`) {
		t.Fatal("the other cue changed")
	}
	if !strings.Contains(out, "\r\n") {
		t.Fatal("line endings lost")
	}
}

func TestReplaceCueSrt(t *testing.T) {
	in := "1\n00:00:01,000 --> 00:00:02,500\nFirst line\nsecond\n\n2\n00:00:03,000 --> 00:00:04,000\nOther\n"
	out, ok := ReplaceCue(in, "srt", 1, 2.5, "First line\nsecond", "Changed\n\nwords")
	if !ok {
		t.Fatal("cue not found")
	}
	want := "1\n00:00:01,000 --> 00:00:02,500\nChanged\nwords\n\n2\n00:00:03,000 --> 00:00:04,000\nOther\n"
	if out != want {
		t.Fatalf("got %q", out)
	}
	if _, ok := ReplaceCue(in, "srt", 10, 11, "Other", "x"); ok {
		t.Fatal("matched a cue at the wrong time")
	}
}

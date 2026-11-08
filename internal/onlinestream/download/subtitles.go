package onlinestream_download

import (
	"bytes"
	"context"
	"fmt"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
)

// downloadedSubtitle is one subtitle track the stream served, saved to disk.
type downloadedSubtitle struct {
	Path      string
	Label     string // what the provider called it ("English", "Spanish - Latin America")
	Language  string // ISO 639-2 code for the MKV track
	IsDefault bool
}

var srtTimingRe = regexp.MustCompile(`\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->`)

// subtitleExtension works out the subtitle format from its content, falling back to the URL.
// ffmpeg picks its demuxer from the extension, so this decides whether the file can be read.
func subtitleExtension(body []byte, rawURL string) string {
	trimmed := bytes.TrimLeft(bytes.TrimPrefix(body, []byte("\xef\xbb\xbf")), " \r\n\t")
	switch {
	case bytes.HasPrefix(trimmed, []byte("WEBVTT")):
		return ".vtt"
	case bytes.Contains(trimmed[:min(len(trimmed), 4096)], []byte("[Script Info]")):
		return ".ass"
	case srtTimingRe.Match(trimmed[:min(len(trimmed), 4096)]):
		return ".srt"
	}
	if u, err := url.Parse(rawURL); err == nil {
		switch ext := strings.ToLower(path.Ext(u.Path)); ext {
		case ".vtt", ".srt", ".ass", ".ssa":
			return ext
		}
	}
	return ""
}

// isThumbnailTrack tells apart the VTT "subtitle" some providers use for seek-bar previews.
func isThumbnailTrack(label string) bool {
	l := strings.ToLower(label)
	return strings.Contains(l, "thumbnail") || strings.Contains(l, "sprite") || strings.Contains(l, "preview")
}

func (d *downloader) downloadSubtitles(ctx context.Context, subs []*subtitleSource, dir string) ([]*downloadedSubtitle, []string) {
	var (
		out      []*downloadedSubtitle
		warnings []string
	)
	for i, s := range subs {
		if ctx.Err() != nil {
			break
		}
		if s.URL == "" || isThumbnailTrack(s.Language) {
			continue
		}
		body, err := d.client.GetBytes(ctx, d.provider, s.URL, d.headers, 32<<20)
		if err != nil {
			warnings = append(warnings, fmt.Sprintf("Could not download the %s subtitles: %v", labelOr(s.Language), err))
			continue
		}
		if bytes.HasPrefix(bytes.TrimSpace(body), []byte("#EXTM3U")) {
			warnings = append(warnings, fmt.Sprintf("The %s subtitles are a segmented playlist, which is not supported", labelOr(s.Language)))
			continue
		}
		ext := subtitleExtension(body, s.URL)
		if ext == "" {
			warnings = append(warnings, fmt.Sprintf("The %s subtitles are in an unknown format and were skipped", labelOr(s.Language)))
			continue
		}
		p := filepath.Join(dir, fmt.Sprintf("sub%02d%s", i, ext))
		if err := os.WriteFile(p, body, 0o644); err != nil {
			warnings = append(warnings, err.Error())
			continue
		}
		out = append(out, &downloadedSubtitle{
			Path:      p,
			Label:     strings.TrimSpace(s.Language),
			Language:  languageCode(s.Language),
			IsDefault: s.IsDefault,
		})
	}
	return out, warnings
}

func labelOr(s string) string {
	if strings.TrimSpace(s) == "" {
		return "unnamed"
	}
	return s
}

// chooseDefaultSubtitle marks one track default: the language the player was showing, else the
// track the provider flagged default, else English, else the first.
func chooseDefaultSubtitle(subs []*downloadedSubtitle, shown string) int {
	if len(subs) == 0 {
		return -1
	}
	if shown = strings.TrimSpace(shown); shown != "" {
		for i, s := range subs {
			if strings.EqualFold(s.Label, shown) {
				return i
			}
		}
		code := languageCode(shown)
		if code != "und" {
			for i, s := range subs {
				if s.Language == code {
					return i
				}
			}
		}
	}
	for i, s := range subs {
		if s.IsDefault {
			return i
		}
	}
	for i, s := range subs {
		if s.Language == "eng" {
			return i
		}
	}
	return 0
}

// languageNames maps the language names and codes providers use to ISO 639-2/B, which is what
// Matroska language tags hold.
var languageNames = map[string]string{
	"english": "eng", "en": "eng", "eng": "eng",
	"japanese": "jpn", "ja": "jpn", "jp": "jpn", "jpn": "jpn",
	"spanish": "spa", "español": "spa", "espanol": "spa", "es": "spa", "spa": "spa", "castellano": "spa",
	"portuguese": "por", "português": "por", "portugues": "por", "pt": "por", "por": "por", "brazilian": "por",
	"french": "fre", "français": "fre", "francais": "fre", "fr": "fre", "fra": "fre", "fre": "fre",
	"german": "ger", "deutsch": "ger", "de": "ger", "deu": "ger", "ger": "ger",
	"italian": "ita", "italiano": "ita", "it": "ita", "ita": "ita",
	"russian": "rus", "русский": "rus", "ru": "rus", "rus": "rus",
	"arabic": "ara", "العربية": "ara", "ar": "ara", "ara": "ara",
	"chinese": "chi", "中文": "chi", "zh": "chi", "zho": "chi", "chi": "chi", "mandarin": "chi", "cantonese": "chi",
	"korean": "kor", "한국어": "kor", "ko": "kor", "kor": "kor",
	"indonesian": "ind", "bahasa indonesia": "ind", "id": "ind", "ind": "ind",
	"malay": "may", "bahasa melayu": "may", "ms": "may", "msa": "may", "may": "may",
	"thai": "tha", "th": "tha", "tha": "tha",
	"vietnamese": "vie", "tiếng việt": "vie", "vi": "vie", "vie": "vie",
	"turkish": "tur", "türkçe": "tur", "tr": "tur", "tur": "tur",
	"polish": "pol", "polski": "pol", "pl": "pol", "pol": "pol",
	"dutch": "dut", "nederlands": "dut", "nl": "dut", "nld": "dut", "dut": "dut",
	"hindi": "hin", "hi": "hin", "hin": "hin",
	"hungarian": "hun", "hu": "hun", "hun": "hun",
	"czech": "cze", "cs": "cze", "ces": "cze", "cze": "cze",
	"romanian": "rum", "ro": "rum", "ron": "rum", "rum": "rum",
	"greek": "gre", "el": "gre", "ell": "gre", "gre": "gre",
	"hebrew": "heb", "he": "heb", "heb": "heb",
	"swedish": "swe", "sv": "swe", "swe": "swe",
	"finnish": "fin", "fi": "fin", "fin": "fin",
	"norwegian": "nor", "no": "nor", "nor": "nor",
	"danish": "dan", "da": "dan", "dan": "dan",
	"ukrainian": "ukr", "uk": "ukr", "ukr": "ukr",
	"persian": "per", "farsi": "per", "fa": "per", "per": "per",
	"filipino": "fil", "tagalog": "fil", "tl": "fil", "fil": "fil",
	"bengali": "ben", "bn": "ben", "ben": "ben",
	"tamil": "tam", "ta": "tam", "tam": "tam",
	"telugu": "tel", "te": "tel", "tel": "tel",
	"catalan": "cat", "ca": "cat", "cat": "cat",
}

// languageCode turns a provider subtitle label into an ISO 639-2 code. Labels look like
// "English", "Spanish - Latin America", "Português (Brasil)", "en-US" or "eng".
func languageCode(label string) string {
	l := strings.ToLower(strings.TrimSpace(label))
	if l == "" {
		return "und"
	}
	if c, ok := languageNames[l]; ok {
		return c
	}
	// "en-US", "pt_BR"
	if i := strings.IndexAny(l, "-_"); i > 0 {
		if c, ok := languageNames[strings.TrimSpace(l[:i])]; ok {
			return c
		}
	}
	// First word: "spanish - latin america", "português (brasil)", "english [cc]"
	word := strings.FieldsFunc(l, func(r rune) bool { return !unicode.IsLetter(r) })
	if len(word) > 0 {
		if c, ok := languageNames[word[0]]; ok {
			return c
		}
	}
	for name, c := range languageNames {
		if len(name) > 3 && strings.Contains(l, name) {
			return c
		}
	}
	return "und"
}

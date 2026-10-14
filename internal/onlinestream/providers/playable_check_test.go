package onlinestream_providers

import (
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"seanime/internal/mkvparser"
)

// checkPlayable fetches a source the way the player does, using the headers the provider returned:
// the manifest, then (for HLS) the first nested playlist and first segment. A 403 on any hop is the
// "HLS error: HTTP Error 403" the web player shows, which a successful search alone does not catch.
func checkPlayable(t *testing.T, srcUrl string, headers map[string]string) {
	t.Helper()
	client := &http.Client{Timeout: 20 * time.Second}

	fetch := func(u string) string {
		req, _ := http.NewRequest("GET", u, nil)
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36")
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("fetch %s: %v", u, err)
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("fetch %s: status %s", u, resp.Status)
		}
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		return string(b)
	}

	if !strings.Contains(srcUrl, ".m3u8") {
		fetch(srcUrl)
		return
	}

	current := srcUrl
	for depth := 0; depth < 3; depth++ {
		body := fetch(current)
		next := ""
		for _, line := range strings.Split(body, "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			next = line
			break
		}
		if next == "" {
			return
		}
		base, _ := url.Parse(current)
		ref, err := url.Parse(next)
		if err != nil {
			t.Fatalf("bad playlist entry %q", next)
		}
		current = base.ResolveReference(ref).String()
		t.Logf("hop %d: %s", depth+1, current)
		if !strings.Contains(current, ".m3u8") {
			fetch(current)
			return
		}
	}
}

func checkSubtitlePlayable(t *testing.T, subtitleURL string, headers map[string]string) {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, subtitleURL, nil)
	if err != nil {
		t.Fatalf("build subtitle request: %v", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36")
	for k, v := range headers {
		req.Header.Set(k, v)
	}

	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		t.Fatalf("fetch subtitle: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		t.Fatalf("fetch subtitle: status %s", resp.Status)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		t.Fatalf("read subtitle: %v", err)
	}
	content := strings.TrimSpace(string(body))
	if content == "" {
		t.Fatal("subtitle response is empty")
	}
	if strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/html") ||
		strings.HasPrefix(strings.ToLower(content), "<!doctype html") ||
		strings.HasPrefix(strings.ToLower(content), "<html") {
		t.Fatal("subtitle URL returned an HTML page instead of subtitle content")
	}
	subtitleType := mkvparser.DetectSubtitleType(content)
	if subtitleType == mkvparser.SubtitleTypeUnknown {
		t.Fatal("subtitle content format could not be detected")
	}
	cueCount := strings.Count(content, "-->")
	if cueCount == 0 {
		for _, line := range strings.Split(content, "\n") {
			if strings.HasPrefix(strings.TrimSpace(line), "Dialogue:") {
				cueCount++
			}
		}
	}
	if cueCount == 0 {
		t.Fatal("subtitle content has no timed cues")
	}
	t.Logf("subtitle contains %d timed cues", cueCount)
	if _, err := mkvparser.ConvertToASS(content, subtitleType); err != nil {
		t.Fatalf("convert subtitle: %v", err)
	}
}

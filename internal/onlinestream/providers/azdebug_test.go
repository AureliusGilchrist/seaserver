package onlinestream_providers

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

// TestAniZoneDebugFetch pulls the search page raw and reports what the extraction sees — the
// fastest way to see which step of the pipeline is losing the results.
func TestAniZoneDebugFetch(t *testing.T) {
	client := &http.Client{Timeout: 15 * time.Second}
	req, _ := http.NewRequest("GET", "https://anizone.to/anime?search=naruto", nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("fetch failed: %v", err)
	}
	defer resp.Body.Close()
	t.Logf("status: %d", resp.StatusCode)

	body, _ := io.ReadAll(resp.Body)
	html := string(body)
	t.Logf("page bytes: %d", len(html))

	idx := strings.Index(html, "JSON.parse('")
	t.Logf("first JSON.parse at: %d", idx)
	itemsIdx := strings.Index(html, "items: JSON.parse('")
	t.Logf("items: JSON.parse at: %d", itemsIdx)

	raw, err := azExtractEmbedded(html, "items: JSON.parse('")
	if err != nil {
		t.Logf("extract error: %v", err)
	} else {
		t.Logf("extracted %d bytes; head: %.160s", len(raw), raw)
	}

	items, err := azExtractJsonArray(html)
	if err != nil {
		t.Logf("azExtractJsonArray error: %v", err)
	} else {
		t.Logf("parsed %d items", len(items))
		for _, it := range items {
			fmt.Printf("  - %s | %s | %s\n", it.Slug, it.MainTitle, it.Url)
		}
	}
}

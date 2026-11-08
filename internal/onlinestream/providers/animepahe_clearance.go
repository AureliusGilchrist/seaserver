package onlinestream_providers

import (
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/goccy/go-json"
	"github.com/imroc/req/v3"
)

// AnimePahe sits behind Cloudflare's "verify you are human" check, which no server request passes
// on its own. The user passes the check once in a real browser (Denshi opens one), and the
// clearance cookie it earns is stored here and sent with AnimePahe's requests, together with that
// browser's user agent and a Chrome-like connection, so Cloudflare sees the same visitor. It lasts
// until Cloudflare expires it; then the check is passed again.
//
// The cookie is bound to the public IP address it was earned from, so it works when the server
// reaches the internet through the same connection as the browser (a server at home).

// AnimePaheClearance is what a passed check leaves behind.
type AnimePaheClearance struct {
	// Cookie is the site's cookies as a request header value ("cf_clearance=...; ...").
	Cookie string `json:"cookie"`
	// UserAgent is the user agent of the browser that passed the check.
	UserAgent string    `json:"userAgent"`
	SavedAt   time.Time `json:"savedAt"`
}

var (
	animepaheClearanceMu   sync.RWMutex
	animepaheClearance     *AnimePaheClearance
	animepaheClearancePath string
	animepaheClearClient   = req.C().ImpersonateChrome().SetTimeout(30 * time.Second)
	// animepaheExpiredAt is when AnimePahe began refusing the saved clearance (nil while it works).
	animepaheExpiredAt atomic.Pointer[time.Time]
)

// AnimePaheClearanceExpiredAt reports since when AnimePahe has refused the saved clearance: it
// has expired (or no longer matches) and the check must be passed again. Nil while it works.
func AnimePaheClearanceExpiredAt() *time.Time {
	return animepaheExpiredAt.Load()
}

func noteAnimePaheAnswer(status int) {
	switch {
	case status == http.StatusForbidden:
		if animepaheExpiredAt.Load() == nil {
			now := time.Now()
			animepaheExpiredAt.Store(&now)
		}
	case status >= 200 && status < 300:
		animepaheExpiredAt.Store(nil)
	}
}

// SetAnimePaheClearanceFile sets where the clearance is kept and loads a saved one.
func SetAnimePaheClearanceFile(path string) {
	animepaheClearanceMu.Lock()
	defer animepaheClearanceMu.Unlock()
	animepaheClearancePath = path
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var c AnimePaheClearance
	if json.Unmarshal(b, &c) == nil && c.Cookie != "" {
		animepaheClearance = &c
	}
}

// SetAnimePaheClearance stores a clearance (nil removes it).
func SetAnimePaheClearance(c *AnimePaheClearance) error {
	animepaheClearanceMu.Lock()
	defer animepaheClearanceMu.Unlock()
	if c != nil {
		c.Cookie = NormalizeAnimePaheCookie(c.Cookie)
		c.UserAgent = strings.TrimSpace(c.UserAgent)
		if c.SavedAt.IsZero() {
			c.SavedAt = time.Now()
		}
	}
	animepaheClearance = c
	animepaheExpiredAt.Store(nil)
	if animepaheClearancePath == "" {
		return nil
	}
	if c == nil {
		_ = os.Remove(animepaheClearancePath)
		return nil
	}
	b, err := json.Marshal(c)
	if err != nil {
		return err
	}
	return os.WriteFile(animepaheClearancePath, b, 0o600)
}

// GetAnimePaheClearance returns the stored clearance, if any.
func GetAnimePaheClearance() *AnimePaheClearance {
	animepaheClearanceMu.RLock()
	defer animepaheClearanceMu.RUnlock()
	if animepaheClearance == nil {
		return nil
	}
	c := *animepaheClearance
	return &c
}

// NormalizeAnimePaheCookie accepts a cookie header, or a bare cf_clearance value, and returns a
// header value.
func NormalizeAnimePaheCookie(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "Cookie:")
	s = strings.TrimPrefix(s, "cookie:")
	s = strings.TrimSpace(s)
	if s != "" && !strings.Contains(s, "=") {
		s = "cf_clearance=" + s
	}
	return s
}

// animepaheGet fetches a URL. AnimePahe's own pages go through the clearance when there is one;
// other hosts (the kwik embed) get the same browser identity without the cookie.
func animepaheGet(client *http.Client, rawURL, userAgent, accept, referer string) (int, []byte, error) {
	c := GetAnimePaheClearance()
	if c == nil {
		r, err := http.NewRequest("GET", rawURL, nil)
		if err != nil {
			return 0, nil, err
		}
		r.Header.Set("User-Agent", userAgent)
		if accept != "" {
			r.Header.Set("Accept", accept)
		}
		r.Header.Set("Referer", referer)
		resp, err := client.Do(r)
		if err != nil {
			return 0, nil, err
		}
		defer resp.Body.Close()
		b, err := io.ReadAll(resp.Body)
		return resp.StatusCode, b, err
	}

	r := animepaheClearClient.R().SetHeader("Referer", referer)
	if c.UserAgent != "" {
		r.SetHeader("User-Agent", c.UserAgent)
	}
	if accept != "" {
		r.SetHeader("Accept", accept)
	}
	ownSite := false
	if u, err := url.Parse(rawURL); err == nil && strings.Contains(u.Host, "animepahe") {
		r.SetHeader("Cookie", c.Cookie)
		ownSite = true
	}
	resp, err := r.Get(rawURL)
	if err != nil {
		return 0, nil, err
	}
	if ownSite {
		noteAnimePaheAnswer(resp.StatusCode)
	}
	b, err := resp.ToBytes()
	return resp.StatusCode, b, err
}

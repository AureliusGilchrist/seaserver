package videocore

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	cdpruntime "github.com/chromedp/cdproto/runtime"
	"github.com/chromedp/chromedp"
)

const (
	// cfSolverUserAgent is a realistic desktop Chrome UA. Headless Chrome's default UA contains
	// "HeadlessChrome", which Cloudflare flags immediately, so we override it. The same UA is used
	// for the in-page fetch below, so the cf_clearance cookie Cloudflare issues stays consistent.
	cfSolverUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"

	// cfSolverTotalTimeout bounds the entire headless operation (launch + navigate + solve + fetch).
	cfSolverTotalTimeout = 45 * time.Second
	// cfSolverChallengeWait bounds how long we wait for the JS challenge to clear after navigation.
	cfSolverChallengeWait = 30 * time.Second
)

// isCloudflareChallenge reports whether an HTTP response (or a rendered page's text) is a
// Cloudflare anti-bot interstitial rather than the real content. It matches both the HTML
// markers of the "Just a moment..." page and the typical 403/503 + HTML-body combination.
func isCloudflareChallenge(status int, body string) bool {
	lower := strings.ToLower(strings.TrimSpace(body))
	if strings.Contains(lower, "just a moment") ||
		strings.Contains(lower, "enable javascript and cookies") ||
		strings.Contains(lower, "challenge-platform") ||
		strings.Contains(lower, "cf-chl") ||
		strings.Contains(lower, "_cf_chl_opt") ||
		strings.Contains(lower, "checking your browser") {
		return true
	}
	looksHTML := strings.HasPrefix(lower, "<!doctype html") || strings.HasPrefix(lower, "<html")
	if (status == 403 || status == 503) && looksHTML {
		return true
	}
	return false
}

// solveCloudflareAndFetch launches a headless Chrome, navigates to subUrl so Cloudflare's
// JavaScript challenge can execute, waits for it to clear, then re-fetches the resource from
// within the now-authorized page context (which holds the cf_clearance cookie) and returns the
// raw body. It is used as a fallback by FetchAndConvertSubsTo when a plain HTTP fetch is blocked.
//
// Requires a Chrome/Chromium binary to be discoverable on the host; if none is found, chromedp
// returns an error and the caller surfaces a clear failure (the subtitle simply won't load).
func (vc *VideoCore) solveCloudflareAndFetch(parentCtx context.Context, subUrl string) (string, error) {
	allocOpts := append(chromedp.DefaultExecAllocatorOptions[:],
		// "new" headless is far less detectable than the legacy headless mode.
		chromedp.Flag("headless", "new"),
		// Hide the most obvious automation fingerprint.
		chromedp.Flag("disable-blink-features", "AutomationControlled"),
		chromedp.UserAgent(cfSolverUserAgent),
	)

	// chromedp's built-in discovery only finds Google Chrome / Chromium. On a typical desktop
	// install (e.g. the denshi build on Windows) Chrome may be absent while a Chromium-family
	// browser like Microsoft Edge — which ships with every Windows 11 — is present. Point
	// chromedp at whichever Chromium browser we can find so the solver works out of the box.
	if execPath := findBrowserExecPath(); execPath != "" {
		vc.logger.Debug().Str("execPath", execPath).Msg("videocore: Using browser for Cloudflare solve")
		allocOpts = append(allocOpts, chromedp.ExecPath(execPath))
	} else {
		vc.logger.Warn().Msg("videocore: No Chromium-family browser found; Cloudflare solve will likely fail (install Chrome/Edge or set SEANIME_CHROME_PATH)")
	}

	allocCtx, allocCancel := chromedp.NewExecAllocator(parentCtx, allocOpts...)
	defer allocCancel()

	browserCtx, browserCancel := chromedp.NewContext(allocCtx)
	defer browserCancel()

	ctx, timeoutCancel := context.WithTimeout(browserCtx, cfSolverTotalTimeout)
	defer timeoutCancel()

	if err := chromedp.Run(ctx, chromedp.Navigate(subUrl)); err != nil {
		return "", fmt.Errorf("failed to start headless browser / navigate: %w", err)
	}

	// Wait Go-side for the challenge to clear. Cloudflare reloads the page itself once solved,
	// which can transiently break an in-page poll, so we re-query in short attempts and retry on
	// error rather than running a single long-lived script in the (soon-to-be-destroyed) context.
	deadline := time.Now().Add(cfSolverChallengeWait)
	cleared := false
	for time.Now().Before(deadline) {
		var snippet string
		evalCtx, evalCancel := context.WithTimeout(ctx, 5*time.Second)
		err := chromedp.Run(evalCtx,
			chromedp.Evaluate(`document.documentElement ? document.documentElement.innerText : ""`, &snippet),
		)
		evalCancel()
		if err == nil && strings.TrimSpace(snippet) != "" && !isCloudflareChallenge(0, snippet) {
			cleared = true
			break
		}
		select {
		case <-ctx.Done():
			return "", fmt.Errorf("headless solve timed out: %w", ctx.Err())
		case <-time.After(750 * time.Millisecond):
		}
	}
	if !cleared {
		return "", fmt.Errorf("cloudflare challenge did not clear within %s", cfSolverChallengeWait)
	}

	// Re-fetch from within the page so we get the exact file bytes (with the cf_clearance cookie),
	// falling back to the rendered body text if the fetch is somehow blocked.
	var content string
	fetchJS := `(async () => {
		try {
			const r = await fetch(window.location.href, { credentials: 'include' });
			return await r.text();
		} catch (e) {
			return document.body ? document.body.innerText : '';
		}
	})()`
	err := chromedp.Run(ctx,
		chromedp.Evaluate(fetchJS, &content, func(p *cdpruntime.EvaluateParams) *cdpruntime.EvaluateParams {
			return p.WithAwaitPromise(true)
		}),
	)
	if err != nil {
		return "", fmt.Errorf("failed to read subtitle content after solving challenge: %w", err)
	}

	return content, nil
}

// findBrowserExecPath locates a Chromium-family browser to drive. Unlike chromedp's built-in
// discovery (Chrome/Chromium only), this also finds Microsoft Edge, Brave and Opera, which makes
// the solver work on stock installs — notably Windows 11, where Edge is always present even when
// Chrome is not. Returns an empty string if nothing suitable is found, letting chromedp fall back
// to its own search (and emit a clear error). Honours the SEANIME_CHROME_PATH override.
func findBrowserExecPath() string {
	if p := strings.TrimSpace(os.Getenv("SEANIME_CHROME_PATH")); p != "" {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}

	// Names resolvable via PATH (covers most system installs regardless of OS).
	names := []string{
		"chrome", "chrome.exe",
		"google-chrome", "google-chrome-stable",
		"chromium", "chromium-browser",
		"msedge", "msedge.exe", "microsoft-edge",
		"brave", "brave-browser",
	}
	for _, n := range names {
		if p, err := exec.LookPath(n); err == nil {
			return p
		}
	}

	// Well-known absolute install locations per OS.
	var candidates []string
	switch runtime.GOOS {
	case "windows":
		pf := os.Getenv("ProgramFiles")
		pf86 := os.Getenv("ProgramFiles(x86)")
		lad := os.Getenv("LOCALAPPDATA")
		candidates = []string{
			filepath.Join(pf, `Google\Chrome\Application\chrome.exe`),
			filepath.Join(pf86, `Google\Chrome\Application\chrome.exe`),
			filepath.Join(lad, `Google\Chrome\Application\chrome.exe`),
			filepath.Join(pf86, `Microsoft\Edge\Application\msedge.exe`),
			filepath.Join(pf, `Microsoft\Edge\Application\msedge.exe`),
			filepath.Join(pf, `BraveSoftware\Brave-Browser\Application\brave.exe`),
			filepath.Join(pf86, `BraveSoftware\Brave-Browser\Application\brave.exe`),
		}
	case "darwin":
		candidates = []string{
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
		}
	default: // linux and other unix-likes
		candidates = []string{
			"/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
			"/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium",
			"/usr/bin/microsoft-edge", "/usr/bin/microsoft-edge-stable",
			"/usr/bin/brave-browser",
		}
	}
	for _, p := range candidates {
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p
		}
	}

	return ""
}

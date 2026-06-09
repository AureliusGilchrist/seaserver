package videocore

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
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
		strings.Contains(lower, "cf-turnstile") ||
		strings.Contains(lower, "verifying you are human") ||
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
	// chromedp's built-in ExecAllocator only finds Chrome/Chromium and learns the DevTools
	// endpoint by parsing the browser's stderr for "DevTools listening on...". Microsoft Edge —
	// the realistic browser on a stock Windows / denshi machine — neither lives where chromedp
	// looks nor prints that line (it writes the port to a DevToolsActivePort file instead). So we
	// launch the browser ourselves, read the port from that file, and attach via a remote
	// allocator. This works uniformly across Chrome, Edge and Brave.
	execPath := findBrowserExecPath()
	if execPath == "" {
		return "", errors.New("no Chromium-family browser found (install Google Chrome or Microsoft Edge, or set SEANIME_CHROME_PATH)")
	}
	vc.logger.Debug().Str("execPath", execPath).Msg("videocore: Using browser for Cloudflare solve")

	userDataDir, err := os.MkdirTemp("", "seanime-cf-")
	if err != nil {
		return "", fmt.Errorf("failed to create temp browser profile: %w", err)
	}
	defer os.RemoveAll(userDataDir)

	launchCtx, launchCancel := context.WithTimeout(parentCtx, cfSolverTotalTimeout)
	defer launchCancel()

	args := []string{
		"--no-first-run",
		"--no-default-browser-check",
		"--no-sandbox",
		"--disable-dev-shm-usage",
		"--disable-blink-features=AutomationControlled",
		"--remote-debugging-port=0",
		"--user-data-dir=" + userDataDir,
		"--user-agent=" + cfSolverUserAgent,
	}
	// Default to "new" headless: it is non-intrusive (no window flashes on the user's screen) and
	// already clears soft/auto-solving Cloudflare challenges. Set SEANIME_CF_HEADLESS=0 to run a
	// real off-screen window instead — marginally better against some interactive challenges, at
	// the cost of briefly spawning a visible browser. (Note: hardened "managed" challenges that
	// detect the CDP automation, e.g. swiftstream.top, are blocked in either mode.)
	if os.Getenv("SEANIME_CF_HEADLESS") == "0" {
		args = append(args, "--window-position=-32000,-32000", "--window-size=1280,800")
	} else {
		args = append(args, "--headless=new", "--disable-gpu")
	}
	args = append(args, "about:blank")

	cmd := exec.CommandContext(launchCtx, execPath, args...)
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to launch browser: %w", err)
	}
	defer killBrowserProcess(cmd)

	wsURL, err := waitForDevToolsWSURL(launchCtx, userDataDir)
	if err != nil {
		return "", err
	}

	allocCtx, allocCancel := chromedp.NewRemoteAllocator(launchCtx, wsURL, chromedp.NoModifyURL)
	defer allocCancel()

	ctx, cancel := chromedp.NewContext(allocCtx)
	defer cancel()

	if err := chromedp.Run(ctx, chromedp.Navigate(subUrl)); err != nil {
		return "", fmt.Errorf("failed to drive headless browser / navigate: %w", err)
	}

	// Wait Go-side for the challenge to clear. Cloudflare reloads the page itself once solved,
	// which can transiently break an in-page poll, so we re-query in short attempts and retry on
	// error rather than running a single long-lived script in the (soon-to-be-destroyed) context.
	deadline := time.Now().Add(cfSolverChallengeWait)
	cleared := false
	for time.Now().Before(deadline) {
		// Inspect the full HTML (not the visible text): the Cloudflare markers — including the
		// Turnstile "Verifying you are human" widget, which renders no matching visible text —
		// live in the document markup. The page is "cleared" once those markers are gone.
		var html string
		evalCtx, evalCancel := context.WithTimeout(ctx, 5*time.Second)
		err := chromedp.Run(evalCtx,
			chromedp.Evaluate(`document.documentElement ? document.documentElement.outerHTML : ""`, &html),
		)
		evalCancel()
		if err == nil && strings.TrimSpace(html) != "" && !isCloudflareChallenge(0, html) {
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
	err = chromedp.Run(ctx,
		chromedp.Evaluate(fetchJS, &content, func(p *cdpruntime.EvaluateParams) *cdpruntime.EvaluateParams {
			return p.WithAwaitPromise(true)
		}),
	)
	if err != nil {
		return "", fmt.Errorf("failed to read subtitle content after solving challenge: %w", err)
	}

	return content, nil
}

// waitForDevToolsWSURL polls the browser's DevToolsActivePort file (written into the user-data
// dir once the DevTools endpoint is up) and returns the browser-level WebSocket debugger URL.
// The file's first line is the port, the second is the ws path (e.g. /devtools/browser/<id>).
func waitForDevToolsWSURL(ctx context.Context, userDataDir string) (string, error) {
	portFile := filepath.Join(userDataDir, "DevToolsActivePort")
	for {
		if b, err := os.ReadFile(portFile); err == nil {
			parts := strings.Split(strings.TrimSpace(string(b)), "\n")
			if len(parts) >= 2 {
				port := strings.TrimSpace(parts[0])
				path := strings.TrimSpace(parts[1])
				if port != "" && path != "" {
					return fmt.Sprintf("ws://127.0.0.1:%s%s", port, path), nil
				}
			}
		}
		select {
		case <-ctx.Done():
			return "", fmt.Errorf("timed out waiting for browser DevTools endpoint: %w", ctx.Err())
		case <-time.After(200 * time.Millisecond):
		}
	}
}

// killBrowserProcess terminates the launched browser. On Windows the launcher can spawn a
// detached process tree, so we use taskkill /T to take the whole tree down; elsewhere a plain
// kill suffices.
func killBrowserProcess(cmd *exec.Cmd) {
	if cmd == nil || cmd.Process == nil {
		return
	}
	pid := cmd.Process.Pid
	if runtime.GOOS == "windows" {
		_ = exec.Command("taskkill", "/F", "/T", "/PID", strconv.Itoa(pid)).Run()
		return
	}
	_ = cmd.Process.Kill()
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

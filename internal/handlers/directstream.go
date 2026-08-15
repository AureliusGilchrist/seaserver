package handlers

import (
	"fmt"
	"io"
	"net/http"
	"net/url"
	"seanime/internal/database/db_bridge"
	"seanime/internal/directstream"
	"seanime/internal/mkvparser"
	"seanime/internal/util"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

// HandleDirectstreamPlayLocalFile
//
//	@summary request local file stream.
//	@desc This requests a local file stream and returns the media container to start the playback.
//	@returns mediastream.MediaContainer
//	@route /api/v1/directstream/play/localfile [POST]
func (h *Handler) HandleDirectstreamPlayLocalFile(c echo.Context) error {
	type body struct {
		Path     string `json:"path"`     // The path of the file.
		ClientId string `json:"clientId"` // The session id
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	lfs, _, err := db_bridge.GetLocalFiles(h.App.Database)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	// Set the client ID and active profile for session isolation and activity tracking
	if b.ClientId != "" {
		h.App.PlaybackManager.SetCurrentClientID(b.ClientId)
	}
	h.App.PlaybackManager.SetActiveProfileID(h.GetProfileID(c))

	return h.App.DirectStreamManager.PlayLocalFile(c.Request().Context(), directstream.PlayLocalFileOptions{
		ClientId:   b.ClientId,
		ProfileID:  h.GetProfileID(c),
		Path:       b.Path,
		LocalFiles: lfs,
	})
}

// HandleDirectstreamConvertSubs
//
//	@summary converts subtitles from one format to another.
//	@returns string
//	@route /api/v1/directstream/subs/convert-subs [POST]
func (h *Handler) HandleDirectstreamConvertSubs(c echo.Context) error {
	type body struct {
		Url     string `json:"url"`
		Content string `json:"content"`
		To      string `json:"to"`
		// Headers are the request headers the extension supplied for the video source
		// (typically Referer/Origin). Subtitle CDNs behind hotlink protection reject
		// requests that don't carry the same headers as the video request.
		Headers map[string]string `json:"headers"`
	}

	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	if b.Url == "" && b.Content == "" {
		return h.RespondWithError(c, fmt.Errorf("url or content is required"))
	}

	if b.To == "" {
		return h.RespondWithError(c, fmt.Errorf("to is required"))
	}

	to := mkvparser.SubtitleTypeASS
	switch b.To {
	case "ass":
		to = mkvparser.SubtitleTypeASS
	case "vtt":
		to = mkvparser.SubtitleTypeWEBVTT
	}

	if len(b.Content) > 0 {
		// Convert from content
		ret, err := h.App.VideoCore.ConvertSubsTo(b.Content, mkvparser.SubtitleTypeUnknown, to)
		if err != nil {
			return h.RespondWithError(c, err)
		}
		return h.RespondWithData(c, ret)
	}

	// Fetch URL using the video proxy client (same transport that fetches HLS from CDNs).
	ua := util.GetRandomUserAgent()
	// Honour a User-Agent supplied by the extension — some CDNs pin the token to it.
	for k, v := range b.Headers {
		if strings.EqualFold(k, "User-Agent") && v != "" {
			ua = v
		}
	}

	// The URL is normalised before anything is asked to fetch it.
	//
	// "http: no Host in request URL" is what Go says when it is handed a URL with no host, and the
	// two ways that happens here are a protocol-relative address ("//cdn.example/x.srt", which some
	// providers hand out) and a redirect whose Location is a bare path. The first is fixed here; the
	// second in the redirect hook below. Both used to surface as a 500 naming a URL that looked
	// perfectly valid in the message, which is a hard thing to read.
	subtitleURL := strings.TrimSpace(b.Url)
	if strings.HasPrefix(subtitleURL, "//") {
		subtitleURL = "https:" + subtitleURL
	}
	if parsed, parseErr := url.Parse(subtitleURL); parseErr != nil || parsed.Host == "" || parsed.Scheme == "" {
		return h.RespondWithError(c, fmt.Errorf(
			"subtitle URL is not a complete address (%q) — the provider gave a link this server cannot fetch on its own", b.Url))
	}

	fetchSubtitle := func(referer string) (*http.Response, error) {
		r, reqErr := http.NewRequest(http.MethodGet, subtitleURL, nil)
		if reqErr != nil {
			return nil, reqErr
		}
		// Extension-supplied headers first, so the subtitle request looks exactly like
		// the video request the same provider already accepted.
		for k, v := range b.Headers {
			if v == "" || strings.EqualFold(k, "Range") || strings.EqualFold(k, "Host") {
				continue
			}
			r.Header.Set(k, v)
		}
		r.Header.Set("User-Agent", ua)
		r.Header.Set("Accept", "*/*")
		if referer != "" {
			r.Header.Set("Referer", referer)
			// Hotlink checks usually validate Origin alongside Referer.
			if origin, parseErr := url.Parse(referer); parseErr == nil && origin.Host != "" {
				r.Header.Set("Origin", origin.Scheme+"://"+origin.Host)
			}
		}
		resp, doErr := h.getVideoProxyClient().Do(r)
		if doErr == nil {
			return resp, nil
		}

		// The shared client could not complete it at all. Every reason that happens here is worth one
		// retry on a plain client:
		//
		//   - a redirect whose Location is a bare path, which resolves to a URL with no host
		//   - the proxy transport itself failing to reach a host it has never seen
		//   - a redirect that dropped the Referer and landed on a hotlink check
		//
		// It used to retry only on the first of those, matched by error text, which meant every other
		// transport failure ended the attempt with a 500 while a plain request would have worked.
		// One extra request against a subtitle file is not worth being precious about.

		redirectClient := &http.Client{
			Timeout: 30 * time.Second,
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) >= 10 {
					return fmt.Errorf("too many redirects")
				}
				if req.URL.Host == "" && len(via) > 0 {
					req.URL = via[len(via)-1].URL.ResolveReference(req.URL)
				}
				for k, v := range via[0].Header {
					if len(v) > 0 && req.Header.Get(k) == "" {
						req.Header.Set(k, v[0])
					}
				}
				return nil
			},
		}

		retryReq, retryErr := http.NewRequest(http.MethodGet, subtitleURL, nil)
		if retryErr != nil {
			return nil, doErr
		}
		retryReq.Header = r.Header.Clone()
		return redirectClient.Do(retryReq)
	}

	// Referer candidates, most specific first: whatever the extension supplied, then the
	// subtitle host itself, then known embed hosts.
	refererCandidates := []string{""}
	for k, v := range b.Headers {
		if v != "" && (strings.EqualFold(k, "Referer") || strings.EqualFold(k, "Origin")) {
			refererCandidates = append([]string{v}, refererCandidates...)
		}
	}
	if parsedURL, parseErr := url.Parse(subtitleURL); parseErr == nil && parsedURL.Host != "" {
		refererCandidates = append(refererCandidates,
			parsedURL.Scheme+"://"+parsedURL.Host+"/",
		)
	}
	refererCandidates = append(refererCandidates,
		"https://kickassanime.mx/",
		"https://kaa.mx/",
		"https://animetsu.net/",
		"https://megacloud.club/",
		"https://megacloud.tv/",
	)

	var resp *http.Response
	var lastStatus int
	var lastErr error
	for _, referer := range refererCandidates {
		r, retryErr := fetchSubtitle(referer)
		if retryErr != nil {
			lastErr = retryErr
			continue
		}
		if r.StatusCode >= 200 && r.StatusCode < 300 {
			resp = r
			break
		}
		lastStatus = r.StatusCode
		r.Body.Close()
		// Only hotlink-protection responses are worth retrying with another referer.
		if r.StatusCode != 401 && r.StatusCode != 403 {
			break
		}
	}

	if resp == nil {
		if lastStatus != 0 {
			return h.RespondWithError(c, fmt.Errorf("subtitle URL returned HTTP %d (hotlink protection, all referers blocked)", lastStatus))
		}
		return h.RespondWithError(c, fmt.Errorf(
			"could not fetch the subtitle file from %s: %w — the provider's subtitle host refused or could not be reached",
			subtitleURL, lastErr))
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return h.RespondWithError(c, fmt.Errorf("subtitle URL returned HTTP %d", resp.StatusCode))
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return h.RespondWithError(c, fmt.Errorf("failed to read subtitle response: %w", err))
	}

	content := strings.TrimSpace(string(bodyBytes))
	ret, err := h.App.VideoCore.ConvertSubsTo(content, mkvparser.SubtitleTypeUnknown, to)
	if err != nil {
		return h.RespondWithError(c, err)
	}

	return h.RespondWithData(c, ret)
}

func (h *Handler) HandleDirectstreamGetStream(c echo.Context) error {
	streamID := c.QueryParam("id")
	handler := h.App.DirectStreamManager.ServeEchoStream(streamID)
	handler.ServeHTTP(c.Response(), c.Request())
	return nil
}

func (h *Handler) HandleDirectstreamGetAttachments(c echo.Context) error {
	streamID := c.QueryParam("id")
	return h.App.DirectStreamManager.ServeEchoAttachments(streamID, c)
}

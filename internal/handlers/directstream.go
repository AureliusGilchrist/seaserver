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

	fetchSubtitle := func(referer string) (*http.Response, error) {
		r, reqErr := http.NewRequest(http.MethodGet, b.Url, nil)
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
		return h.getVideoProxyClient().Do(r)
	}

	// Referer candidates, most specific first: whatever the extension supplied, then the
	// subtitle host itself, then known embed hosts.
	refererCandidates := []string{""}
	for k, v := range b.Headers {
		if v != "" && (strings.EqualFold(k, "Referer") || strings.EqualFold(k, "Origin")) {
			refererCandidates = append([]string{v}, refererCandidates...)
		}
	}
	if parsedURL, parseErr := url.Parse(b.Url); parseErr == nil && parsedURL.Host != "" {
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
		return h.RespondWithError(c, fmt.Errorf("failed to fetch subtitle URL: %w", lastErr))
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

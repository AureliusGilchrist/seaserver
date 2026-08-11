package handlers

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"crypto/tls"
	"encoding/hex"
	"io"
	"net/http"
	url2 "net/url"
	"seanime/internal/util"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/5rahim/hls-m3u8/m3u8"
	"github.com/andybalholm/brotli"
	"github.com/goccy/go-json"
	"github.com/klauspost/compress/zstd"
	"github.com/labstack/echo/v4"
	"github.com/rs/zerolog/log"
)

var proxyUA = util.GetRandomUserAgent()

// videoProxyClient2 is lazily initialized per-handler to use the privacy transport.
// The getVideoProxyClient method on Handler provides the client.
var fallbackVideoProxyClient = &http.Client{
	Transport: &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
		ForceAttemptHTTP2:   false,
		TLSClientConfig:     &tls.Config{InsecureSkipVerify: true},
	},
	Timeout: 60 * time.Second,
}

func (h *Handler) getVideoProxyClient() *http.Client {
	if h.App.PrivacyManager != nil {
		return &http.Client{
			Transport: h.App.PrivacyManager.ProxyTransport(),
			Timeout:   60 * time.Second,
		}
	}
	return fallbackVideoProxyClient
}

func (h *Handler) VideoProxy(c echo.Context) (err error) {
	defer util.HandlePanicInModuleWithError("util/VideoProxy", &err)

	url := c.QueryParam("url")
	headers := c.QueryParam("headers")
	authToken := c.QueryParam("token")

	// Always use GET request internally, even for HEAD requests
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		log.Error().Err(err).Msg("proxy: Error creating request")
		return echo.NewHTTPError(http.StatusInternalServerError)
	}

	var headerMap map[string]string
	if headers != "" {
		if err := json.Unmarshal([]byte(headers), &headerMap); err != nil {
			log.Error().Err(err).Msg("proxy: Error unmarshalling headers")
			return echo.NewHTTPError(http.StatusInternalServerError)
		}
		for key, value := range headerMap {
			// Everything the provider asks for is forwarded except the headers that describe the
			// transfer itself rather than the request.
			//
			// Accept-Encoding is the one that matters. Go's transport compresses transparently — it
			// adds "Accept-Encoding: gzip" and unzips the response before anyone sees it — but only
			// while the request does not name an encoding itself. A provider that copies browser-like
			// headers sends "Accept-Encoding: gzip, deflate, br", which switches that off: the CDN
			// then answers in brotli and the body arrives here as compressed bytes that nothing
			// downstream can read. For a playlist that surfaced as "#EXTM3U absent" and a stream that
			// would not start, because what was parsed as a playlist was a block of binary.
			//
			// Dropped rather than honoured, so the transport negotiates the encoding it can undo.
			// decodeBody below still handles a response that comes back encoded anyway.
			if isTransferHeader(key) {
				continue
			}
			req.Header.Set(key, value)
		}
	}

	req.Header.Set("User-Agent", proxyUA)
	req.Header.Set("Accept", "*/*")
	if rangeHeader := c.Request().Header.Get("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}

	resp, err := h.getVideoProxyClient().Do(req)

	if err != nil {
		log.Error().Err(err).Msg("proxy: Error sending request")
		return echo.NewHTTPError(http.StatusInternalServerError)
	}
	defer resp.Body.Close()

	// Copy response headers
	for k, vs := range resp.Header {
		for _, v := range vs {
			// Content-Length is skipped, which fixes net::ERR_CONTENT_LENGTH_MISMATCH. So is
			// Content-Encoding: the body handed to the client below has already been decompressed —
			// by the transport or by decodeBody — so passing the upstream encoding on would have the
			// browser try to undo a compression that is no longer there.
			if strings.EqualFold(k, "Content-Length") || isTransferHeader(k) {
				continue
			}
			c.Response().Header().Set(k, v)
		}
	}

	// Set CORS headers
	c.Response().Header().Set("Access-Control-Allow-Origin", "*")
	c.Response().Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	c.Response().Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")

	// For HEAD requests, return only headers
	if c.Request().Method == http.MethodHead {
		return c.NoContent(http.StatusOK)
	}

	// Whatever encoding survived the transport is undone here, so both branches below work on the
	// actual bytes rather than on a compressed copy of them.
	body, bodyErr := decodeBody(resp)
	if bodyErr != nil {
		log.Error().Err(bodyErr).Str("url", url).Str("encoding", resp.Header.Get("Content-Encoding")).
			Msg("proxy: Could not decompress response")
		return echo.NewHTTPError(http.StatusBadGateway, "Failed to decompress upstream response")
	}
	defer body.Close()

	isHlsPlaylist := strings.HasSuffix(url, ".m3u8") || strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "mpegurl")

	if !isHlsPlaylist {
		return c.Stream(resp.StatusCode, c.Response().Header().Get("Content-Type"), body)
	}

	// HLS Playlist
	//log.Debug().Str("url", url).Msg("proxy: Processing HLS playlist")

	bodyBytes, readErr := io.ReadAll(body)
	if readErr != nil {
		log.Error().Err(readErr).Str("url", url).Msg("proxy: Error reading HLS response body")
		return echo.NewHTTPError(http.StatusInternalServerError, "Failed to read HLS playlist")
	}

	playlist, listType, decodeErr := decodePlaylist(bodyBytes)
	if decodeErr != nil {
		// Nothing here could be turned into a playlist, so the URIs inside it cannot be pointed back
		// through this proxy. Passing it on raw is the old behaviour and it is kept, but it is very
		// unlikely to play: the segment and key URLs then go straight to the CDN from the browser,
		// without the headers the provider requires and against an Access-Control-Allow-Origin that
		// names the provider's own site rather than this one.
		//
		// Which is why the start of the body is logged. "#EXTM3U absent" on its own says only that
		// what arrived was not a playlist — not whether it was an error page, a challenge, or a
		// compressed body nothing had undone — and that is the difference between the causes.
		log.Warn().Err(decodeErr).
			Str("url", url).
			Int("status", resp.StatusCode).
			Str("contentType", resp.Header.Get("Content-Type")).
			Str("contentEncoding", resp.Header.Get("Content-Encoding")).
			Int("bodyLen", len(bodyBytes)).
			Str("bodyStart", bodyPreview(bodyBytes)).
			Msg("proxy: Failed to decode M3U8 playlist, proxying raw content")
		c.Response().Header().Set(echo.HeaderContentType, resp.Header.Get("Content-Type")) // Use original Content-Type
		c.Response().Header().Set(echo.HeaderContentLength, strconv.Itoa(len(bodyBytes)))
		c.Response().WriteHeader(resp.StatusCode)
		_, writeErr := c.Response().Writer.Write(bodyBytes)
		return writeErr
	}

	var modifiedPlaylistBytes []byte
	needsRewrite := false         // Flag to check if we actually need to rewrite
	baseURL, _ := url2.Parse(url) // Base URL for resolving relative paths

	if listType == m3u8.MEDIA {
		mediaPl := playlist.(*m3u8.MediaPlaylist)

		for _, segment := range mediaPl.Segments {
			if segment != nil {
				// Rewrite Segment URI
				if rewriteURI(&segment.URI, baseURL, headerMap, authToken) {
					needsRewrite = true
				}

				// Rewrite encryption key URIs
				for i := range segment.Keys {
					if rewriteURI(&segment.Keys[i].URI, baseURL, headerMap, authToken) {
						needsRewrite = true
					}
				}

				if segment.Map != nil {
					if rewriteURI(&segment.Map.URI, baseURL, headerMap, authToken) {
						needsRewrite = true
					}
				}
			}
		}

		for _, segment := range mediaPl.PartialSegments {
			if segment != nil {
				// Rewrite Segment URI
				if rewriteURI(&segment.URI, baseURL, headerMap, authToken) {
					needsRewrite = true
				}
			}
		}

		if mediaPl.PreloadHints != nil {
			if rewriteURI(&mediaPl.PreloadHints.URI, baseURL, headerMap, authToken) {
				needsRewrite = true
			}
		}

		if mediaPl.Map != nil {
			if rewriteURI(&mediaPl.Map.URI, baseURL, headerMap, authToken) {
				needsRewrite = true
			}
		}

		// Rewrite playlist-level encryption key URIs
		for i := range mediaPl.Keys {
			if rewriteURI(&mediaPl.Keys[i].URI, baseURL, headerMap, authToken) {
				needsRewrite = true
			}
		}

		// Encode the modified media playlist
		buffer := mediaPl.Encode()
		modifiedPlaylistBytes = buffer.Bytes()

	} else if listType == m3u8.MASTER {
		// Rewrite URIs in Master playlists
		masterPl := playlist.(*m3u8.MasterPlaylist)

		for _, variant := range masterPl.Variants {
			if variant != nil {
				if rewriteURI(&variant.URI, baseURL, headerMap, authToken) {
					needsRewrite = true
				}

				// Handle alternative media groups (audio, subtitles, etc.)
				for _, alternative := range variant.Alternatives {
					if alternative != nil && rewriteURI(&alternative.URI, baseURL, headerMap, authToken) {
						needsRewrite = true
					}
				}
			}
		}

		// Rewrite session key URIs
		for i := range masterPl.SessionKeys {
			if rewriteURI(&masterPl.SessionKeys[i].URI, baseURL, headerMap, authToken) {
				needsRewrite = true
			}
		}

		// Encode the modified master playlist
		buffer := masterPl.Encode()
		modifiedPlaylistBytes = buffer.Bytes()

	} else {
		// Unknown type, pass through
		modifiedPlaylistBytes = bodyBytes
	}

	// Update headers
	contentType := "application/vnd.apple.mpegurl"
	c.Response().Header().Set(echo.HeaderContentType, contentType)
	c.Response().Header().Set(echo.HeaderContentLength, strconv.Itoa(len(modifiedPlaylistBytes)))
	if resp.Header.Get("Cache-Control") == "" {
		c.Response().Header().Set("Cache-Control", "no-cache")
	}
	log.Debug().Bool("rewritten", needsRewrite).Str("url", url).Msg("proxy: Sending modified HLS playlist")
	c.Response().WriteHeader(resp.StatusCode)

	return c.Blob(http.StatusOK, c.Response().Header().Get("Content-Type"), modifiedPlaylistBytes)
}

// isTransferHeader reports whether a header describes how a body is carried rather than what is
// being asked for. These belong to the hop, not to the request, so they are neither forwarded
// upstream nor passed back to the client — this proxy decides its own.
func isTransferHeader(key string) bool {
	switch strings.ToLower(strings.TrimSpace(key)) {
	case "accept-encoding", "content-encoding", "transfer-encoding", "connection", "host":
		return true
	}
	return false
}

// decodeBody returns the response body with any content encoding undone.
//
// Go's transport already handles the gzip it asked for itself, and deletes the header when it does,
// so in the ordinary case this hands back the body untouched. It exists for the case where the
// server answered in an encoding nobody asked for: without it those bytes are read as if they were
// text, which is how a perfectly good playlist arrives looking like it has no #EXTM3U line.
func decodeBody(resp *http.Response) (io.ReadCloser, error) {
	switch strings.ToLower(strings.TrimSpace(resp.Header.Get("Content-Encoding"))) {
	case "", "identity":
		return resp.Body, nil
	case "gzip", "x-gzip":
		r, err := gzip.NewReader(resp.Body)
		if err != nil {
			return nil, err
		}
		return readCloser{r, resp.Body}, nil
	case "deflate":
		// Sent both ways in the wild: zlib-wrapped, as the specification says, and raw. Try the
		// correct one and fall back to the common mistake rather than failing the stream over it.
		raw, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, err
		}
		if zr, zerr := zlib.NewReader(bytes.NewReader(raw)); zerr == nil {
			return zr, nil
		}
		return io.NopCloser(flate.NewReader(bytes.NewReader(raw))), nil
	case "br":
		return readCloser{io.NopCloser(brotli.NewReader(resp.Body)), resp.Body}, nil
	case "zstd":
		r, err := zstd.NewReader(resp.Body)
		if err != nil {
			return nil, err
		}
		return readCloser{r.IOReadCloser(), resp.Body}, nil
	default:
		// An encoding nothing here knows. Handing the bytes on untouched is what happened before,
		// and it at least lets a client that does understand it cope.
		return resp.Body, nil
	}
}

// readCloser pairs a decompressing reader with the underlying body, so closing it closes both and
// the connection can be reused.
type readCloser struct {
	io.Reader
	underlying io.Closer
}

func (r readCloser) Close() error {
	if c, ok := r.Reader.(io.Closer); ok {
		_ = c.Close()
	}
	return r.underlying.Close()
}

// extM3U is the line every playlist has to open with.
var extM3U = []byte("#EXTM3U")

// decodePlaylist parses a playlist, forgiving the things a playlist is routinely served with that
// the parser will not accept.
//
// Two of them. A byte order mark, or any blank space, in front of the opening line: the parser
// compares that line for exact equality, so a single invisible byte in front of it means the
// playlist "has no #EXTM3U" and the whole thing is rejected. And a tag somewhere further down that
// the parser does not like — in strict mode the first such tag fails the entire playlist, even
// though everything this proxy needs from it, the URIs, parsed perfectly well.
//
// So: trim, parse strictly, and if that fails on a body that visibly is a playlist, parse it again
// leniently rather than giving up on it. Only a body with no opening line anywhere in it is refused
// outright — that is not a lenient-parsing problem, that is not a playlist.
func decodePlaylist(bodyBytes []byte) (m3u8.Playlist, m3u8.ListType, error) {
	trimmed := bytes.TrimLeft(bodyBytes, "\xef\xbb\xbf \t\r\n")

	buffer := bytes.NewBuffer(trimmed)
	playlist, listType, decodeErr := m3u8.Decode(*buffer, true)
	if decodeErr == nil {
		return playlist, listType, nil
	}

	if !bytes.Contains(trimmed, extM3U) {
		return nil, listType, decodeErr
	}

	lenient := bytes.NewBuffer(trimmed)
	playlist, listType, lenientErr := m3u8.Decode(*lenient, false)
	if lenientErr != nil {
		return nil, listType, decodeErr
	}
	if listType != m3u8.MEDIA && listType != m3u8.MASTER {
		// Parsed, but into nothing recognisable — no variants and no segments to rewrite. Better
		// reported as the failure it is than passed on as an empty playlist.
		return nil, listType, decodeErr
	}

	log.Debug().Err(decodeErr).Msg("proxy: Playlist rejected by strict parsing, accepted leniently")
	return playlist, listType, nil
}

// bodyPreview renders the start of a body for a log line: printable text as text, anything else as
// hex, so a compressed or binary body is recognisable as such rather than as mojibake.
func bodyPreview(body []byte) string {
	const max = 160

	head := body
	if len(head) > max {
		head = head[:max]
	}

	if utf8.Valid(head) && strings.IndexFunc(string(head), func(r rune) bool {
		return r < 0x20 && r != '\n' && r != '\r' && r != '\t'
	}) == -1 {
		return strings.ReplaceAll(string(head), "\n", "\\n")
	}
	return "hex:" + hex.EncodeToString(head)
}

// rewriteURI rewrites a URI pointer if needed, returns true if modified
func rewriteURI(uri *string, baseURL *url2.URL, headerMap map[string]string, authToken string) bool {
	if *uri == "" || isAlreadyProxied(*uri) {
		return false
	}

	// Resolve relative URLs
	if !strings.HasPrefix(*uri, "http") {
		*uri = resolveURL(baseURL, *uri)
	}

	*uri = toProxyURL(*uri, headerMap, authToken)
	return true
}

func resolveURL(base *url2.URL, relativeURI string) string {
	if base == nil {
		return relativeURI // Cannot resolve without a base
	}
	relativeURL, err := url2.Parse(relativeURI)
	if err != nil {
		return relativeURI // Invalid relative URI
	}
	return base.ResolveReference(relativeURL).String()
}

func toProxyURL(targetMediaURL string, headerMap map[string]string, authToken string) string {
	proxyURL := "/api/v1/proxy?url=" + url2.QueryEscape(targetMediaURL)
	if len(headerMap) > 0 {
		headersStrB, err := json.Marshal(headerMap)
		// Ignore marshalling errors here? Or log them? For simplicity, ignoring now.
		if err == nil && len(headersStrB) > 2 { // Check > 2 for "{}" empty map
			proxyURL += "&headers=" + url2.QueryEscape(string(headersStrB))
		}
	}
	if authToken != "" {
		proxyURL += "&token=" + url2.QueryEscape(authToken)
	}
	return proxyURL
}

func isAlreadyProxied(url string) bool {
	// Check if the URL contains the proxy pattern
	return strings.Contains(url, "/api/v1/proxy?url=") || strings.Contains(url, url2.QueryEscape("/api/v1/proxy?url="))
}

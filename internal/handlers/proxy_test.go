package handlers

import (
	"bytes"
	"compress/gzip"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/5rahim/hls-m3u8/m3u8"
	"github.com/andybalholm/brotli"
)

// The playlist from the failing stream, byte for byte as the CDN serves it.
const masterPlaylist = `#EXTM3U
#EXT-X-VERSION:4
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="AAC",DEFAULT=YES,AUTOSELECT=YES,URI="audio/playlist.m3u8?expires=1786500176&sign=Eg7lF-dpkkleh8OJm9lPfw"

#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=8206036,BANDWIDTH=12648484,CODECS="avc1.640032,mp4a.40.2",RESOLUTION=1920x1080,AUDIO="audio"
v_1920x1080/playlist.m3u8?expires=1786500176&sign=QqviwH2L-OQHvLDQ1NPuVw

#EXT-X-I-FRAME-STREAM-INF:AVERAGE-BANDWIDTH=530835,BANDWIDTH=30254289,CODECS="avc1.640032",RESOLUTION=1920x1080,URI="v_1920x1080/iframes.m3u8"
`

func TestDecodePlaylistAcceptsPlainPlaylist(t *testing.T) {
	pl, listType, err := decodePlaylist([]byte(masterPlaylist))
	if err != nil {
		t.Fatalf("decode failed: %v", err)
	}
	if listType != m3u8.MASTER {
		t.Fatalf("expected a master playlist, got %v", listType)
	}
	if len(pl.(*m3u8.MasterPlaylist).Variants) != 2 {
		t.Fatalf("expected 2 variants, got %d", len(pl.(*m3u8.MasterPlaylist).Variants))
	}
}

// A byte order mark in front of the opening line used to be read as "#EXTM3U absent", because the
// parser compares that line for exact equality.
func TestDecodePlaylistAcceptsByteOrderMarkAndLeadingSpace(t *testing.T) {
	for name, body := range map[string]string{
		"bom":             "\xef\xbb\xbf" + masterPlaylist,
		"leading newline": "\n\n" + masterPlaylist,
		"leading spaces":  "  \t" + masterPlaylist,
	} {
		t.Run(name, func(t *testing.T) {
			if _, listType, err := decodePlaylist([]byte(body)); err != nil || listType != m3u8.MASTER {
				t.Fatalf("decode failed: listType=%v err=%v", listType, err)
			}
		})
	}
}

// A body that is not a playlist at all — an error page, a challenge — is still refused, so the
// leniency above cannot turn one into an empty playlist.
func TestDecodePlaylistRejectsNonPlaylist(t *testing.T) {
	if _, _, err := decodePlaylist([]byte("<html><body>Access denied</body></html>")); err == nil {
		t.Fatal("expected an HTML error page to be refused")
	}
}

// The regression this was reported for: a provider that asks for brotli or gzip turns off the
// transport's transparent decompression, and the compressed bytes were parsed as if they were the
// playlist — which is exactly what "#EXTM3U absent" was.
func TestDecodeBodyUndoesContentEncoding(t *testing.T) {
	t.Run("gzip", func(t *testing.T) {
		var buf bytes.Buffer
		zw := gzip.NewWriter(&buf)
		_, _ = zw.Write([]byte(masterPlaylist))
		_ = zw.Close()

		assertDecodesTo(t, "gzip", buf.Bytes())
	})

	t.Run("br", func(t *testing.T) {
		var buf bytes.Buffer
		bw := brotli.NewWriter(&buf)
		_, _ = bw.Write([]byte(masterPlaylist))
		_ = bw.Close()

		assertDecodesTo(t, "br", buf.Bytes())
	})

	t.Run("identity", func(t *testing.T) {
		assertDecodesTo(t, "", []byte(masterPlaylist))
	})
}

func assertDecodesTo(t *testing.T, encoding string, encoded []byte) {
	t.Helper()

	resp := &http.Response{
		Header: http.Header{},
		Body:   io.NopCloser(bytes.NewReader(encoded)),
	}
	if encoding != "" {
		resp.Header.Set("Content-Encoding", encoding)
	}

	body, err := decodeBody(resp)
	if err != nil {
		t.Fatalf("decodeBody(%q) failed: %v", encoding, err)
	}
	defer body.Close()

	got, err := io.ReadAll(body)
	if err != nil {
		t.Fatalf("reading decoded body failed: %v", err)
	}
	if string(got) != masterPlaylist {
		t.Fatalf("decoded body does not match the playlist:\n%q", string(got))
	}

	if _, listType, decErr := decodePlaylist(got); decErr != nil || listType != m3u8.MASTER {
		t.Fatalf("decoded body did not parse: listType=%v err=%v", listType, decErr)
	}
}

// Accept-Encoding from a provider is what disabled transparent decompression in the first place, so
// it must not reach the upstream request. Referer and the like still must.
func TestIsTransferHeader(t *testing.T) {
	for _, key := range []string{"Accept-Encoding", "accept-encoding", "Content-Encoding", "Transfer-Encoding", "Connection", "Host"} {
		if !isTransferHeader(key) {
			t.Errorf("%q should be treated as a transfer header", key)
		}
	}
	for _, key := range []string{"Referer", "Origin", "User-Agent", "Cookie", "Authorization"} {
		if isTransferHeader(key) {
			t.Errorf("%q should be forwarded", key)
		}
	}
}

// The log line is the only thing that can tell the causes apart, so a binary body has to be
// recognisable as binary in it.
func TestBodyPreview(t *testing.T) {
	if got := bodyPreview([]byte("#EXTM3U\n#EXT-X-VERSION:4")); !strings.HasPrefix(got, "#EXTM3U") {
		t.Errorf("text body should be previewed as text, got %q", got)
	}
	if got := bodyPreview([]byte{0x1f, 0x8b, 0x08, 0x00}); !strings.HasPrefix(got, "hex:") {
		t.Errorf("binary body should be previewed as hex, got %q", got)
	}
}

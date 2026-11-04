package chapter_downloader

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"testing"

	hibikemanga "seanime/internal/extension/hibike/manga"
	"seanime/internal/util"
)

// A page that comes back as a web page is worth another try; an image nothing can read is not.
func TestDownloadPageFailureKinds(t *testing.T) {
	var pngBytes bytes.Buffer
	img := image.NewRGBA(image.Rect(0, 0, 3, 2))
	img.Set(0, 0, color.White)
	if err := png.Encode(&pngBytes, img); err != nil {
		t.Fatal(err)
	}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/page.png":
			w.Header().Set("Content-Type", "image/png")
			_, _ = w.Write(pngBytes.Bytes())
		case "/challenge":
			w.Header().Set("Content-Type", "text/html")
			_, _ = w.Write([]byte("<!DOCTYPE html><html><body>Just a moment...</body></html>"))
		case "/page.avif":
			w.Header().Set("Content-Type", "image/avif")
			_, _ = w.Write(append([]byte{0, 0, 0, 0x1c, 'f', 't', 'y', 'p', 'a', 'v', 'i', 'f'}, make([]byte, 64)...))
		}
	}))
	defer srv.Close()

	cd := &Downloader{logger: util.NewLogger()}
	dir := t.TempDir()
	registry := map[int]PageInfo{}

	if err := cd.downloadPageToRegistry(&hibikemanga.ChapterPage{URL: srv.URL + "/page.png", Index: 0}, dir, &registry); err != nil {
		t.Fatalf("png: %v", err)
	}
	if got := registry[0]; got.Width != 3 || got.Height != 2 || got.Filename != "01.png" {
		t.Fatalf("png registry entry: %+v", got)
	}

	var notImage errNotAnImage
	if err := cd.downloadPageToRegistry(&hibikemanga.ChapterPage{URL: srv.URL + "/challenge", Index: 1}, dir, &registry); !errors.As(err, &notImage) {
		t.Fatalf("html page: got %v, want errNotAnImage", err)
	}
	if err := cd.downloadPageToRegistry(&hibikemanga.ChapterPage{URL: srv.URL + "/page.avif", Index: 2}, dir, &registry); !errors.Is(err, errUnreadableImage) {
		t.Fatalf("avif: got %v, want errUnreadableImage", err)
	}
	if len(registry) != 1 {
		t.Fatalf("failed pages were registered: %+v", registry)
	}
}

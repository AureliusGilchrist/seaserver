package handlers

import "testing"

func TestImageExtension(t *testing.T) {
	for contentType, want := range map[string]string{
		"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp",
		"image/svg+xml": "", "text/html": "", "": "",
	} {
		if got := imageExtension(contentType); got != want {
			t.Errorf("%q: got %q, want %q", contentType, got, want)
		}
	}
}

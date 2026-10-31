package torrent_client

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"seanime/internal/torrent_clients/qbittorrent/model"
	qbittorrent_util "seanime/internal/torrent_clients/qbittorrent/util"
	"strings"
	"testing"
)

func TestQbittorrentAddConflictIsRecognised(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusConflict)
		_, _ = io.WriteString(w, "Fails.")
	}))
	defer server.Close()

	err := qbittorrent_util.PostMultipartLinks(server.Client(), server.URL, &qbittorrent_model.AddTorrentsOptions{}, []string{"magnet:?xt=urn:btih:abc"})
	if err == nil {
		t.Fatal("a 409 must not read as an added torrent")
	}
	if !isAddConflict(err) {
		t.Fatalf("a 409 add must be recognised, got %v", err)
	}
	if !strings.Contains(err.Error(), "Fails.") {
		t.Fatalf("the error should keep qBittorrent's answer, got %v", err)
	}
}

func TestOtherAddErrorsAreNotConflicts(t *testing.T) {
	if isAddConflict(errors.New("invalid status 409 Conflict")) {
		t.Fatal("only a typed status error counts")
	}
	if isAddConflict(fmt.Errorf("wrapped: %w", &qbittorrent_util.StatusError{Code: 403})) {
		t.Fatal("a 403 is not a conflict")
	}
	if !isAddConflict(fmt.Errorf("wrapped: %w", &qbittorrent_util.StatusError{Code: 409})) {
		t.Fatal("a wrapped 409 is a conflict")
	}
}

func TestMagnetInfoHash(t *testing.T) {
	const hash = "0b6fac21c725995ca928cbccd78fd462adc1457b"
	if got := MagnetInfoHash("magnet:?xt=urn:btih:" + hash + "&dn=Girls%20Bravo"); got != hash {
		t.Fatalf("got %q", got)
	}
	if got := MagnetInfoHash("not a magnet"); got != "" {
		t.Fatalf("got %q", got)
	}
}

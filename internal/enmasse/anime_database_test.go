package enmasse

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestDownloadAnimeDatabase(t *testing.T) {
	animeDatabaseMinSize = 10
	defer func() { animeDatabaseMinSize = 1 << 20 }()

	good := `{"data":[{"sources":["https://anilist.co/anime/1"],"title":"Cowboy Bebop","type":"TV","episodes":26,"status":"FINISHED","synonyms":[]}]}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/bad" {
			_, _ = w.Write([]byte("<html>rate limited</html> padding padding"))
			return
		}
		_, _ = w.Write([]byte(good))
	}))
	defer srv.Close()

	path := filepath.Join(t.TempDir(), "Databases", "anime-offline-database-minified.json")
	if err := downloadAnimeDatabase(context.Background(), srv.URL+"/good", path); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(path); string(b) != good {
		t.Fatalf("saved %q", b)
	}

	// A response that is not the database never replaces the file.
	if err := downloadAnimeDatabase(context.Background(), srv.URL+"/bad", path); err == nil {
		t.Fatal("an HTML page was accepted as the database")
	}
	if b, _ := os.ReadFile(path); string(b) != good {
		t.Fatal("the good file was replaced")
	}
}

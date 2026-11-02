package handlers

import (
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"seanime/internal/api/anilist"
	"seanime/internal/connectivity"
	"seanime/internal/core"
	"seanime/internal/util/filecache"

	"github.com/goccy/go-json"
	"github.com/labstack/echo/v4"
)

// reopenCacher closes fc and opens the same directory again, as a server restart would.
func reopenCacher(t *testing.T, fc *filecache.Cacher, dir string) *filecache.Cacher {
	t.Helper()
	if err := fc.Close(); err != nil {
		t.Fatal(err)
	}
	fc, err := filecache.NewCacher(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = fc.Close() })
	return fc
}

func offlineGet(t *testing.T, h *Handler, path string, id int, handle func(*Handler, echo.Context) error) *httptest.ResponseRecorder {
	t.Helper()
	connectivity.SetForcedOffline(true)
	t.Cleanup(func() { connectivity.SetForcedOffline(false) })

	e := echo.New()
	rec := httptest.NewRecorder()
	c := e.NewContext(httptest.NewRequest(http.MethodGet, path, nil), rec)
	c.SetParamNames("id")
	c.SetParamValues(strconv.Itoa(id))
	if err := handle(h, c); err != nil {
		t.Fatal(err)
	}
	return rec
}

func TestAnimeDetailsAreServedFromDiskOfflineAfterRestart(t *testing.T) {
	dir := t.TempDir()
	fc, err := filecache.NewCacher(dir)
	if err != nil {
		t.Fatal(err)
	}
	const id = 990001
	saveDetailsToDisk(fc, id, &anilist.AnimeDetailsById_Media{ID: id})
	fc = reopenCacher(t, fc, dir)

	rec := offlineGet(t, &Handler{App: &core.App{FileCacher: fc}}, "/api/v1/anilist/media-details/", id, (*Handler).HandleGetAnilistAnimeDetails)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Data *anilist.AnimeDetailsById_Media `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Data == nil || body.Data.ID != id {
		t.Fatalf("got %s, want details of %d", rec.Body.String(), id)
	}
}

func TestMediaFamilyIsRebuiltFromDiskOfflineAfterRestart(t *testing.T) {
	dir := t.TempDir()
	fc, err := filecache.NewCacher(dir)
	if err != nil {
		t.Fatal(err)
	}
	// 990011 → SEQUEL 990012 → SEQUEL 990013
	edge := func(rel string, to int) *anilist.FamilyEdge {
		return &anilist.FamilyEdge{RelationType: rel, Node: &anilist.FamilyEdgeNode{ID: to}}
	}
	node := func(id int, edges ...*anilist.FamilyEdge) *anilist.FamilyNode {
		return &anilist.FamilyNode{ID: id, Type: "ANIME", Relations: &anilist.FamilyRelations{Edges: edges}}
	}
	saveFamilyToDisk(fc, &anilist.FamilyGraph{Truncated: true, Nodes: map[int]*anilist.FamilyNode{
		990011: node(990011, edge("SEQUEL", 990012)),
		990012: node(990012, edge("PREQUEL", 990011), edge("SEQUEL", 990013)),
		990013: node(990013, edge("PREQUEL", 990012)),
	}})
	fc = reopenCacher(t, fc, dir)

	// Asked from the middle member: found through the index, not the franchise key (990011).
	rec := offlineGet(t, &Handler{App: &core.App{FileCacher: fc}}, "/api/v1/anilist/media/family", 990012, (*Handler).HandleGetMediaFamily)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Data MediaFamilyResponse `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if !body.Data.Truncated || len(body.Data.Members) != 3 {
		t.Fatalf("got %s, want 3 members, truncated", rec.Body.String())
	}
	relations := map[int]string{}
	for _, m := range body.Data.Members {
		relations[m.ID] = m.Relation
	}
	if relations[990013] != "SEQUEL" || relations[990011] != "PREQUEL" {
		t.Fatalf("relations from 990012 = %v", relations)
	}
}

func TestMediaFamilyWithNothingOnDiskStillFailsOffline(t *testing.T) {
	fc, err := filecache.NewCacher(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = fc.Close() })
	if _, ok := loadFamilyFromDisk(fc, 990099); ok {
		t.Fatal("found a franchise that was never stored")
	}
	if _, ok := loadDetailsFromDisk(fc, 990099); ok {
		t.Fatal("found details that were never stored")
	}
}

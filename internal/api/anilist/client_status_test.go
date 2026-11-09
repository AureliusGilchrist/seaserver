package anilist

import (
	"strings"
	"testing"
)

func TestBuildUpdateMediaListEntryDocumentOmitsNil(t *testing.T) {
	id, progress := 5, 3
	status := MediaListStatusCurrent
	doc, vars := buildUpdateMediaListEntryDocument(&id, &status, nil, &progress, nil, nil)

	if strings.Contains(doc, "scoreRaw") || strings.Contains(doc, "startedAt") || strings.Contains(doc, "completedAt") {
		t.Fatalf("nil fields must not appear in the mutation:\n%s", doc)
	}
	for _, want := range []string{"$mediaId: Int", "$status: MediaListStatus", "$progress: Int", "progress: $progress"} {
		if !strings.Contains(doc, want) {
			t.Fatalf("missing %q in:\n%s", want, doc)
		}
	}
	if _, ok := vars["scoreRaw"]; ok {
		t.Fatal("scoreRaw must not be sent")
	}
	if len(vars) != 3 {
		t.Fatalf("want 3 vars, got %v", vars)
	}
}

package onlinestream_providers

import (
	"reflect"
	"testing"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
)

func TestMediaSearchQueriesIncludesAllDistinctAliases(t *testing.T) {
	english := "English Name"
	queries := mediaSearchQueries(hibikeonlinestream.SearchOptions{
		Query: "Romaji Name",
		Media: hibikeonlinestream.Media{
			EnglishTitle: &english,
			RomajiTitle:  "Romaji Name",
			Synonyms:     []string{"Alternate Name", " English Name ", "Another Alias", ""},
		},
	})

	expected := []string{"Romaji Name", "English Name", "Alternate Name", "Another Alias"}
	if !reflect.DeepEqual(queries, expected) {
		t.Fatalf("expected search queries %#v, got %#v", expected, queries)
	}
}

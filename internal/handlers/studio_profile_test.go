package handlers

import (
	"testing"

	"seanime/internal/api/anilist"
)

func TestDirectorRole(t *testing.T) {
	for role, want := range map[string]bool{
		"Director": true, "Chief Director": true, "Series Director": true,
		"Assistant Director": true, "Co-Director": true,
		"Episode Director": false, "Director of Photography": false, "Director (ep 3)": false, "Director ": true, "Sound Director": false, "Art Director": false, "Animation Director": false,
	} {
		if got := isDirectorCredit(role); got != want {
			t.Errorf("%q: got %v, want %v", role, got, want)
		}
	}
}

func TestStudioStats(t *testing.T) {
	works := []*StudioWork{
		{ID: 1, IsMainStudio: true, Format: "TV", Status: "FINISHED", Episodes: 12, Duration: 24, StartDate: &anilist.FamilyDate{Year: 2010}, MeanScore: 80, Popularity: 1000, Genres: []string{"Action"}},
		{ID: 2, IsMainStudio: true, Format: "MOVIE", Status: "FINISHED", Episodes: 1, Duration: 100, StartDate: &anilist.FamilyDate{Year: 2013}, MeanScore: 60, Popularity: 0, Genres: []string{"Action", "Drama"}},
		{ID: 3, IsMainStudio: false, Format: "TV", Status: "RELEASING", StartDate: &anilist.FamilyDate{Year: 2024}},
		{ID: 4, IsMainStudio: true, Format: "TV", Status: "NOT_YET_RELEASED", SeasonYear: 2027},
	}
	st := studioStats(works)
	if st.MainCount != 3 || st.SupportingCount != 1 || st.Airing != 1 || st.Upcoming != 1 {
		t.Fatalf("counts: %+v", st)
	}
	if st.FirstYear != 2010 || st.LastYear != 2013 || len(st.Years) != 4 || st.Years[3].Count != 1 {
		t.Fatalf("years: %+v", st)
	}
	if st.TotalMinutes != 12*24+100 || st.Genres[0].Key != "Action" || st.Genres[0].Count != 2 {
		t.Fatalf("totals: %+v", st)
	}
	// Popularity-weighted: the popular 80 outweighs the unknown 60.
	if st.MeanScore < 78 || st.MeanScore > 80 {
		t.Fatalf("mean score %v", st.MeanScore)
	}
}

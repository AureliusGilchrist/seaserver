package db

import (
	"seanime/internal/database/models"
	"seanime/internal/util"
	"testing"
)

// Each database (the install-wide one and every profile's) keeps its own theme and cache, so one
// profile's look never shows for another.
func TestThemeIsPerDatabase(t *testing.T) {
	open := func(name string) *Database {
		d, err := NewDatabase(t.TempDir(), name, util.NewLogger())
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = d.Close() })
		return d
	}
	global, profile := open("global"), open("profile")

	if profile.HasTheme() {
		t.Fatal("a fresh database has no theme row")
	}
	if _, err := global.UpsertTheme(&models.Theme{BaseModel: models.BaseModel{ID: 1}, AccentColor: "#ff0000"}); err != nil {
		t.Fatal(err)
	}
	if !global.HasTheme() {
		t.Fatal("theme row expected after upsert")
	}
	if profile.HasTheme() {
		t.Fatal("the global upsert must not create the profile's row")
	}

	pt, err := profile.GetTheme()
	if err != nil {
		t.Fatal(err)
	}
	if pt.AccentColor == "#ff0000" {
		t.Fatal("profile theme picked up the global cache")
	}

	if _, err := profile.UpsertTheme(&models.Theme{BaseModel: models.BaseModel{ID: 1}, AccentColor: "#00ff00"}); err != nil {
		t.Fatal(err)
	}
	gc, _ := global.GetThemeCopy()
	pc, _ := profile.GetThemeCopy()
	if gc.AccentColor != "#ff0000" || pc.AccentColor != "#00ff00" {
		t.Fatalf("themes leaked across databases: global=%q profile=%q", gc.AccentColor, pc.AccentColor)
	}
}

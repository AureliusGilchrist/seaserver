package handlers

import (
	"errors"
	"testing"

	"github.com/goccy/go-json"
)

func TestWalkStaffPages(t *testing.T) {
	pages := 0
	partial, err := walkStaffPages(func(page int) (bool, error) {
		pages = page
		return page < 3, nil
	})
	if err != nil || partial || pages != 3 {
		t.Fatalf("should stop at the last page: pages=%d partial=%v err=%v", pages, partial, err)
	}

	if _, err := walkStaffPages(func(int) (bool, error) { return false, errors.New("refused") }); err == nil {
		t.Fatal("a failed first page has nothing to show and must be an error")
	}

	partial, err = walkStaffPages(func(page int) (bool, error) {
		if page == 2 {
			return false, errors.New("refused")
		}
		return true, nil
	})
	if err != nil || !partial {
		t.Fatalf("a later failure keeps what arrived: partial=%v err=%v", partial, err)
	}

	partial, _ = walkStaffPages(func(int) (bool, error) { return true, nil })
	if !partial {
		t.Fatal("running out of pages before AniList does is a partial answer")
	}
}

func TestStaffCareerKeepsTheMediaShape(t *testing.T) {
	var edge StaffCareerVoiceRole
	raw := `{"characterRole":"MAIN","characters":[{"id":7,"name":{"full":"Name"},"image":{"large":"x"}}],"node":{"id":9,"title":{"romaji":"T"}}}`
	if err := json.Unmarshal([]byte(raw), &edge); err != nil {
		t.Fatal(err)
	}
	if edge.CharacterRole != "MAIN" || edge.Characters[0].ID != 7 || edge.Characters[0].Name.Full != "Name" {
		t.Fatalf("unexpected edge: %+v", edge)
	}
	var node map[string]any
	if err := json.Unmarshal(edge.Node, &node); err != nil || node["id"].(float64) != 9 {
		t.Fatalf("node should pass through untouched: %s", edge.Node)
	}
}

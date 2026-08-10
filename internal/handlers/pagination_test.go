package handlers

import "testing"

func TestPaginationDefault(t *testing.T) {
	// The case that used to panic. A search request is entitled to omit page and perPage — both are
	// `omitempty` — and the handler has to survive it.
	t.Run("fills in a missing value", func(t *testing.T) {
		got := paginationDefault(nil, 20)
		if got == nil {
			t.Fatal("got nil, want a usable pointer")
		}
		if *got != 20 {
			t.Errorf("got %d, want 20", *got)
		}
	})

	t.Run("leaves a supplied value alone", func(t *testing.T) {
		asked := 3
		got := paginationDefault(&asked, 20)
		if got != &asked {
			t.Error("the caller's own pointer was replaced")
		}
		if *got != 3 {
			t.Errorf("got %d, want 3", *got)
		}
	})

	// Page and perPage are defaulted independently: one being absent must not decide the other.
	t.Run("one missing does not disturb the other", func(t *testing.T) {
		perPage := 50
		page := paginationDefault(nil, 1)
		kept := paginationDefault(&perPage, 20)
		if *page != 1 {
			t.Errorf("page = %d, want 1", *page)
		}
		if *kept != 50 {
			t.Errorf("perPage = %d, want the supplied 50", *kept)
		}
	})
}

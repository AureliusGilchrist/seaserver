package manga_providers

import "testing"

// IDs reach this provider in more than one shape: a fresh search gives the bare ULID, a stored
// record can carry "ULID/slug", and a copied link is a full URL. The site tolerates the slug on its
// ordinary pages — which is what made this easy to miss — but its fragment endpoints answer 307 and
// redirect to a page with no chapter list in it. Every title the en masse manga downloader was
// given came back as "no chapters found" for that reason alone.
func TestNormalizeIDAcceptsEveryFormAnIDArrivesIn(t *testing.T) {
	const ulid = "01J76XYGGTCN6WB246BCM66SD7"

	cases := map[string]string{
		ulid:                             ulid,
		ulid + "/DRCL-midnight-children": ulid,
		"https://weebcentral.com/series/" + ulid + "/DRCL-midnight-children": ulid,
		"https://weebcentral.com/series/" + ulid:                             ulid,
	}

	for input, want := range cases {
		if got := normalizeID(input); got != want {
			t.Errorf("normalizeID(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestNormalizeChapterIDAcceptsEveryForm(t *testing.T) {
	const ulid = "01J76XYY7Q5DA1HQMDD9D7GQTC"

	cases := map[string]string{
		ulid:                ulid,
		ulid + "/some-slug": ulid,
		"https://weebcentral.com/chapters/" + ulid: ulid,
		"/chapters/" + ulid:                        ulid,
	}

	for input, want := range cases {
		if got := normalizeChapterID(input); got != want {
			t.Errorf("normalizeChapterID(%q) = %q, want %q", input, got, want)
		}
	}
}

// Anything unrecognisable is passed through rather than mangled — a wrong id that reaches the site
// fails visibly, where an id silently emptied here would look like a manga with no chapters.
func TestNormalizeLeavesUnknownFormsAlone(t *testing.T) {
	if got := normalizeID("not-an-id"); got != "not-an-id" {
		t.Errorf("got %q, want the input unchanged", got)
	}
	if got := normalizeChapterID(""); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}

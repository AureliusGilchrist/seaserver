package onlinestream_providers

import (
	"testing"

	"github.com/goccy/go-json"
)

func TestAnimePaheSearchShape(t *testing.T) {
	// The site sends session as a string and id as a number.
	body := `{"total":1,"data":[{"id":4,"title":"Naruto","type":"TV","episodes":220,"year":2002,"session":"7f3a-uuid"}]}`
	var res animepaheSearchResponse
	if err := json.Unmarshal([]byte(body), &res); err != nil {
		t.Fatal(err)
	}
	if len(res.Data) != 1 || res.Data[0].Session != "7f3a-uuid" || res.Data[0].ID != "4" {
		t.Fatalf("%+v", res.Data)
	}
}

func TestAnimePaheReleaseShape(t *testing.T) {
	body := `{"last_page":1,"data":[{"episode":13,"session":"a"},{"episode":"14","session":"b"},{"episode":13.5,"session":"c"}]}`
	var res animepaheReleaseResponse
	if err := json.Unmarshal([]byte(body), &res); err != nil {
		t.Fatal(err)
	}
	if res.LastPage.Float() != 1 || res.Data[1].Episode.Float() != 14 || res.Data[2].Episode.Float() != 13.5 {
		t.Fatalf("%+v", res)
	}
}

func TestAnimePaheBestKwik(t *testing.T) {
	page := `
<button data-src="https://kwik.si/e/aaa" data-fansub="X" data-resolution="360" data-audio="jpn" data-av1="0">
<button data-src="https://kwik.si/e/bbb" data-fansub="X" data-resolution="1080" data-audio="eng" data-av1="0">
<button data-src="https://kwik.si/e/ccc" data-fansub="X" data-resolution="1080" data-audio="jpn" data-av1="1">
<button data-src="https://kwik.si/e/ddd" data-fansub="X" data-resolution="1080" data-audio="jpn" data-av1="0">`
	if u, res := animepaheBestKwik(page, false); u != "https://kwik.si/e/ddd" || res != 1080 {
		t.Fatalf("sub: %s %d", u, res)
	}
	if u, _ := animepaheBestKwik(page, true); u != "https://kwik.si/e/bbb" {
		t.Fatalf("dub: %s", u)
	}
}

func TestAnimePaheUnpackKwik(t *testing.T) {
	page := `<script>eval(function(p,a,c,k,e,d){e=function(c){return c};return p}('0 1=\'2\';',10,3,'const|source|https://vault-01.owocdn.top/stream/01/02/abc/uwu.m3u8'.split('|'),0,{}))</script>`
	if got := animepaheUnpackKwikScript(page); got != "https://vault-01.owocdn.top/stream/01/02/abc/uwu.m3u8" {
		t.Fatalf("got %q", got)
	}
}

func TestAnimePaheExpiry(t *testing.T) {
	defer animepaheExpiredAt.Store(nil)
	noteAnimePaheAnswer(403)
	first := AnimePaheClearanceExpiredAt()
	if first == nil {
		t.Fatal("a 403 should mark the clearance expired")
	}
	noteAnimePaheAnswer(403)
	if AnimePaheClearanceExpiredAt() != first {
		t.Fatal("the first refusal's time should be kept")
	}
	noteAnimePaheAnswer(200)
	if AnimePaheClearanceExpiredAt() != nil {
		t.Fatal("an answer should clear it")
	}
}

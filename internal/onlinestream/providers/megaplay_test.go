package onlinestream_providers

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestMegaPlayID(t *testing.T) {
	for in, want := range map[string]megaPlayID{
		"387:13":       {anilistID: 387, episodes: 13},
		"99699:12/dub": {anilistID: 99699, episodes: 12, dub: true},
		"21:0":         {anilistID: 21},
		"21":           {anilistID: 21},
	} {
		got, err := parseMegaPlayID(in)
		if err != nil || got != want {
			t.Errorf("%q: got %+v, %v", in, got, err)
		}
	}
	if _, err := parseMegaPlayID("abc"); err == nil {
		t.Error("a non-numeric id parses")
	}
	if s := (megaPlayID{anilistID: 5, episodes: 3, dub: true}).String(); s != "5:3/dub" {
		t.Errorf("got %q", s)
	}
}

func TestMegaPlayDecrypt(t *testing.T) {
	plain := []byte(`{"file":"https://cdn.example/anime/aa/bb/master.m3u8"}`)
	pad := aes.BlockSize - len(plain)%aes.BlockSize
	for i := 0; i < pad; i++ {
		plain = append(plain, byte(pad))
	}
	key := make([]byte, 32)
	copy(key, megaPlayAESKey)
	block, _ := aes.NewCipher(key)
	ct := make([]byte, len(plain))
	cipher.NewCBCEncrypter(block, []byte(megaPlayIV)).CryptBlocks(ct, plain)
	got, err := megaPlayDecrypt(base64.RawURLEncoding.EncodeToString(ct))
	if err != nil || got != "https://cdn.example/anime/aa/bb/master.m3u8" {
		t.Fatalf("got %q, %v", got, err)
	}
}

func TestMegaPlaySign(t *testing.T) {
	a, b := strings.Repeat("a", 32), strings.Repeat("B", 32)
	now := time.Unix(1700000000, 0)
	signed := megaPlaySign("https://cdn.example/anime/"+a+"/"+b+"/master.m3u8", now)
	u, _ := url.Parse(signed)
	parts := strings.Split(u.Query().Get("token"), ".")
	if len(parts) != 2 {
		t.Fatalf("token %q", u.Query().Get("token"))
	}
	payload, _ := base64.RawURLEncoding.DecodeString(parts[0])
	if string(payload) != "1700000090|"+a+"/"+strings.ToLower(b) {
		t.Errorf("payload %q", payload)
	}
	mac := hmac.New(sha256.New, []byte(megaPlayTokenKey))
	mac.Write(payload)
	if parts[1] != base64.RawURLEncoding.EncodeToString(mac.Sum(nil)) {
		t.Error("bad signature")
	}
	if got := megaPlaySign("https://cdn.example/plain.m3u8", now); got != "https://cdn.example/plain.m3u8" {
		t.Errorf("a url without ids changed: %q", got)
	}
}

func TestLastEpisodeOf(t *testing.T) {
	for _, c := range []struct{ actual, known, want int }{
		{13, 13, 13},    // the count is right
		{15, 12, 15},    // a show still airing has more than the saved count
		{10, 13, 10},    // the site has fewer
		{1180, 0, 1180}, // no count
		{1, 0, 1},
		{1, 1, 1},
	} {
		calls := 0
		got, err := lastEpisodeOf(func(n int) (bool, error) { calls++; return n <= c.actual, nil }, c.known, 3000)
		if err != nil || got != c.want {
			t.Errorf("actual %d known %d: got %d (%v)", c.actual, c.known, got, err)
		}
		if calls > 40 {
			t.Errorf("actual %d known %d: %d probes", c.actual, c.known, calls)
		}
	}
}

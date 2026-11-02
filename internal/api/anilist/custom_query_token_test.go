package anilist

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"seanime/internal/events"
	"seanime/internal/util"
	"sync"
	"testing"
)

// fakeAnilist serves raw queries locally and records the Authorization header of each one.
func fakeAnilist(t *testing.T, handler func(w http.ResponseWriter, auth string)) *[]string {
	t.Helper()
	var mu sync.Mutex
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		seen = append(seen, r.Header.Get("Authorization"))
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		handler(w, r.Header.Get("Authorization"))
	}))
	prev := customQueryURL
	customQueryURL = srv.URL
	t.Cleanup(func() {
		customQueryURL = prev
		srv.Close()
	})
	return &seen
}

type countingEvents struct {
	events.WSEventManagerInterface
	mu    sync.Mutex
	names []string
}

func (c *countingEvents) SendEvent(name string, _ interface{}) {
	c.mu.Lock()
	c.names = append(c.names, name)
	c.mu.Unlock()
}

var okBody = []byte(`{"data":{"Page":{}}}`)

func TestCustomQueryFallsBackToClientToken(t *testing.T) {
	seen := fakeAnilist(t, func(w http.ResponseWriter, _ string) { _, _ = w.Write(okBody) })
	client := NewAnilistClient("own-token", "")
	logger := util.NewLogger()

	if _, err := client.CustomQuery([]byte(`{"query":"{ Page { id } }"}`), logger); err != nil {
		t.Fatalf("no token argument: %v", err)
	}
	if _, err := client.CustomQuery([]byte(`{"query":"{ Page { id } }"}`), logger, ""); err != nil {
		t.Fatalf("empty token argument: %v", err)
	}
	if _, err := client.CustomQuery([]byte(`{"query":"{ Page { id } }"}`), logger, "other-token"); err != nil {
		t.Fatalf("explicit token: %v", err)
	}

	want := []string{"Bearer own-token", "Bearer own-token", "Bearer other-token"}
	if len(*seen) != len(want) {
		t.Fatalf("requests = %v, want %v", *seen, want)
	}
	for i := range want {
		if (*seen)[i] != want[i] {
			t.Fatalf("request %d Authorization = %q, want %q", i, (*seen)[i], want[i])
		}
	}
}

func TestCustomQueryWithoutTokenSendsNoHeader(t *testing.T) {
	seen := fakeAnilist(t, func(w http.ResponseWriter, _ string) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"errors":[{"message":"Unauthorized.","status":401}],"data":null}`))
	})
	client := NewAnilistClient("", "")

	_, err := client.CustomQuery([]byte(`{"query":"{ Page { id } }"}`), util.NewLogger())
	if err == nil || errors.Is(err, ErrTokenRejected) {
		t.Fatalf("err = %v, want a plain error (no token was sent, so nothing was rejected)", err)
	}
	if (*seen)[0] != "" {
		t.Fatalf("Authorization = %q, want none", (*seen)[0])
	}
	if client.TokenRejected() {
		t.Fatal("a client without a token must not be marked rejected")
	}
}

func TestCustomQueryRejectedTokenMarksClientOnce(t *testing.T) {
	cases := map[string]func(w http.ResponseWriter, _ string){
		"http 401": func(w http.ResponseWriter, _ string) {
			w.WriteHeader(http.StatusUnauthorized)
			_, _ = w.Write([]byte(`{"errors":[{"message":"Unauthorized.","status":401}],"data":null}`))
		},
		"invalid token error": func(w http.ResponseWriter, _ string) {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte(`{"errors":[{"message":"Invalid token","status":400}],"data":null}`))
		},
	}
	for name, handler := range cases {
		t.Run(name, func(t *testing.T) {
			fakeAnilist(t, handler)
			client := NewAnilistClient("dead-token", "")
			ev := &countingEvents{}
			client.SetWSEventManager(ev)
			client.SetTokenExpiredProfileID(7)

			for i := 0; i < 3; i++ {
				_, err := client.CustomQuery([]byte(`{"query":"{ Page { id } }"}`), util.NewLogger())
				if !errors.Is(err, ErrTokenRejected) {
					t.Fatalf("attempt %d: err = %v, want ErrTokenRejected", i, err)
				}
			}
			if !client.TokenRejected() {
				t.Fatal("client should be marked rejected")
			}
			if len(ev.names) != 1 || ev.names[0] != events.AnilistTokenExpired {
				t.Fatalf("events = %v, want one %q", ev.names, events.AnilistTokenExpired)
			}
		})
	}
}

func TestCustomQueryRejectedExplicitTokenLeavesClientAlone(t *testing.T) {
	fakeAnilist(t, func(w http.ResponseWriter, _ string) {
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"errors":[{"message":"Unauthorized."}]}`))
	})
	client := NewAnilistClient("own-token", "")

	_, err := client.CustomQuery([]byte(`{"query":"{ Page { id } }"}`), util.NewLogger(), "someone-elses")
	if !errors.Is(err, ErrTokenRejected) {
		t.Fatalf("err = %v, want ErrTokenRejected", err)
	}
	if client.TokenRejected() {
		t.Fatal("a refused caller-supplied token must not mark the client's own token rejected")
	}
}

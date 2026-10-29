package qbittorrent

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"seanime/internal/util"
)

// Login must accept both the pre-5.2 success form (200 "Ok.") and qBittorrent 5.2's
// 204 No Content, and still reject failures.
func TestClient_Login(t *testing.T) {
	tests := []struct {
		name       string
		status     int
		body       string
		shouldPass bool
	}{
		{"200 Ok.", 200, "Ok.", true},
		{"204 No Content", 204, "", true},
		{"200 Fails.", 200, "Fails.", false},
		{"403", 403, "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != "/api/v2/auth/login" {
					http.Error(w, "unexpected path", 404)
					return
				}
				// The SID cookie is set on both success forms; a failed login sets none.
				if tt.shouldPass {
					http.SetCookie(w, &http.Cookie{Name: "SID", Value: "test-sid"})
				}
				w.WriteHeader(tt.status)
				_, _ = w.Write([]byte(tt.body))
			}))
			defer ts.Close()

			// NewClient only takes host[:port], so extract them from the test server URL.
			host := ts.URL[len("http://"):]
			client := NewClient(&NewClientOptions{
				Logger:   util.NewLogger(),
				Username: "admin",
				Password: "password",
				Host:     host,
			})

			err := client.Login()
			if tt.shouldPass {
				assert.Nil(t, err)
				assert.NotNil(t, client.client.Jar)
			} else {
				assert.NotNil(t, err, fmt.Sprintf("expected login to fail, got %v", err))
			}
		})
	}
}

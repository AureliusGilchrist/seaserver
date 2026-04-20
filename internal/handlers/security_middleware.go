package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
)

// ============================
// CSRF Protection
// ============================

var csrfTokenStore = &sync.Map{}

type csrfEntry struct {
	token   string
	expires time.Time
}

// CSRFMiddleware enforces CSRF token validation on state-changing HTTP methods.
// Clients must include a matching X-CSRF-Token header on POST/PUT/PATCH/DELETE requests.
// The CSRF token is set via the X-CSRF-Token response header on any GET request.
func CSRFMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		clientID, _ := c.Get("Seanime-Client-Id").(string)
		if clientID == "" {
			clientID = c.RealIP()
		}

		method := c.Request().Method

		// For GET/HEAD/OPTIONS requests, issue a CSRF token
		if method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions {
			token := generateCSRFToken()
			csrfTokenStore.Store(clientID, csrfEntry{
				token:   token,
				expires: time.Now().Add(6 * time.Hour),
			})
			c.Response().Header().Set("X-CSRF-Token", token)
			return next(c)
		}

		// For state-changing methods, validate the token
		requestToken := c.Request().Header.Get("X-CSRF-Token")
		if requestToken == "" {
			return echo.NewHTTPError(http.StatusForbidden, "missing CSRF token")
		}

		entry, ok := csrfTokenStore.Load(clientID)
		if !ok {
			return echo.NewHTTPError(http.StatusForbidden, "CSRF token not found, please refresh")
		}

		stored := entry.(csrfEntry)
		if time.Now().After(stored.expires) {
			csrfTokenStore.Delete(clientID)
			return echo.NewHTTPError(http.StatusForbidden, "CSRF token expired, please refresh")
		}

		if stored.token != requestToken {
			return echo.NewHTTPError(http.StatusForbidden, "invalid CSRF token")
		}

		return next(c)
	}
}

func generateCSRFToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ============================
// Rate Limiting
// ============================

type rateLimitEntry struct {
	count     int
	windowEnd time.Time
}

type RateLimiter struct {
	mu       sync.Mutex
	clients  map[string]*rateLimitEntry
	limit    int
	window   time.Duration
	stopChan chan struct{}
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		clients:  make(map[string]*rateLimitEntry),
		limit:    limit,
		window:   window,
		stopChan: make(chan struct{}),
	}
	// Periodic cleanup of expired entries
	go func() {
		ticker := time.NewTicker(window)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				rl.cleanup()
			case <-rl.stopChan:
				return
			}
		}
	}()
	return rl
}

func (rl *RateLimiter) cleanup() {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := time.Now()
	for key, entry := range rl.clients {
		if now.After(entry.windowEnd) {
			delete(rl.clients, key)
		}
	}
}

func (rl *RateLimiter) Allow(clientID string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	entry, exists := rl.clients[clientID]

	if !exists || now.After(entry.windowEnd) {
		rl.clients[clientID] = &rateLimitEntry{
			count:     1,
			windowEnd: now.Add(rl.window),
		}
		return true
	}

	entry.count++
	return entry.count <= rl.limit
}

// RateLimitMiddleware limits requests per client session (identified by Seanime-Client-Id cookie).
func RateLimitMiddleware(rl *RateLimiter) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// Skip rate limiting for streaming/long-poll endpoints
			path := c.Request().URL.Path
			if strings.HasPrefix(path, "/api/v1/mediastream/") ||
				strings.HasPrefix(path, "/api/v1/directstream/") ||
				strings.HasPrefix(path, "/api/v1/proxy") ||
				strings.HasPrefix(path, "/events") {
				return next(c)
			}

			clientID, _ := c.Get("Seanime-Client-Id").(string)
			if clientID == "" {
				clientID = c.RealIP()
			}

			if !rl.Allow(clientID) {
				return echo.NewHTTPError(http.StatusTooManyRequests, "rate limit exceeded, try again later")
			}

			return next(c)
		}
	}
}

// ============================
// Secure Headers
// ============================

// SecureHeadersMiddleware adds security-related HTTP headers to all responses.
func SecureHeadersMiddleware(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		h := c.Response().Header()

		// Prevent MIME-type sniffing
		h.Set("X-Content-Type-Options", "nosniff")

		// Prevent clickjacking
		h.Set("X-Frame-Options", "SAMEORIGIN")

		// XSS protection (legacy browsers)
		h.Set("X-XSS-Protection", "1; mode=block")

		// Prevent referrer leaks
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")

		// Restrict permissions/features
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")

		// Cache control for API responses
		if strings.HasPrefix(c.Request().URL.Path, "/api/") {
			h.Set("Cache-Control", "no-store, no-cache, must-revalidate")
			h.Set("Pragma", "no-cache")
		}

		return next(c)
	}
}

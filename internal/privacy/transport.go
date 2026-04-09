package privacy

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"seanime/internal/goja/goja_bindings"
	"sync"
	"time"

	"github.com/rs/zerolog"
	"golang.org/x/net/proxy"
)

// Manager coordinates all privacy layers: DoH failover, SOCKS5 proxy, and DNSCrypt.
// It provides a centralized HTTP transport that routes all outgoing traffic through
// the configured privacy layers.
type Manager struct {
	mu        sync.RWMutex
	logger    *zerolog.Logger
	settings  *Settings
	transport *http.Transport

	// DoH
	dohManager *DoHManager

	// DNSCrypt
	dnsCryptManager *DNSCryptManager
}

// Settings holds all privacy-related configuration.
type Settings struct {
	// DoH
	DoHEnabled   bool     `json:"dohEnabled"`
	DoHProviders []string `json:"dohProviders"` // Ordered failover list

	// SOCKS5
	Socks5Enabled bool   `json:"socks5Enabled"`
	Socks5Address string `json:"socks5Address"` // e.g. "127.0.0.1"
	Socks5Port    int    `json:"socks5Port"`    // e.g. 1080

	// DNSCrypt
	DNSCryptEnabled bool `json:"dnsCryptEnabled"`

	// Fail mode: "open" = fallback to direct on proxy failure, "closed" = block
	FailMode string `json:"failMode"` // "open" or "closed"
}

// DefaultSettings returns privacy settings with sensible defaults (all disabled).
func DefaultSettings() *Settings {
	return &Settings{
		DoHEnabled: false,
		DoHProviders: []string{
			"https://dns.mullvad.net/dns-query",
			"https://dns.quad9.net/dns-query",
			"https://cloudflare-dns.com/dns-query",
		},
		Socks5Enabled: false,
		Socks5Address: "127.0.0.1",
		Socks5Port:    1080,
		DNSCryptEnabled: false,
		FailMode:        "open",
	}
}

func NewManager(logger *zerolog.Logger) *Manager {
	m := &Manager{
		logger:   logger,
		settings: DefaultSettings(),
	}
	m.buildTransport()
	return m
}

// UpdateSettings applies new privacy settings and rebuilds the transport.
func (m *Manager) UpdateSettings(s *Settings) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.settings = s
	m.buildTransport()

	// (Re-)start DoH if settings changed
	if m.dohManager != nil {
		m.dohManager.Stop()
	}
	if s.DoHEnabled && len(s.DoHProviders) > 0 {
		m.dohManager = NewDoHManager(s.DoHProviders, m.logger)
		go m.dohManager.Start()
	}

	// DNSCrypt
	if m.dnsCryptManager != nil {
		m.dnsCryptManager.Stop()
		m.dnsCryptManager = nil
	}
	if s.DNSCryptEnabled {
		m.dnsCryptManager = NewDNSCryptManager(m.logger)
		go m.dnsCryptManager.Start()
	}

	m.logger.Info().
		Bool("doh", s.DoHEnabled).
		Bool("socks5", s.Socks5Enabled).
		Bool("dnscrypt", s.DNSCryptEnabled).
		Str("failMode", s.FailMode).
		Msg("privacy: Settings updated")

	// Apply as global default so ALL http.Get/Post/DefaultClient calls are routed
	// (done under existing write lock, no need for separate read lock)
	http.DefaultTransport = m.transport
	m.logger.Info().Msg("privacy: Global HTTP transport updated")

	// Also inject into extension runtime clients (imroc/req uses its own transport)
	if s.Socks5Enabled && s.Socks5Address != "" {
		proxyURL := fmt.Sprintf("socks5://%s:%d", s.Socks5Address, s.Socks5Port)
		goja_bindings.ApplyProxyURL(proxyURL)
	}
}

// GetSettings returns a copy of the current settings.
func (m *Manager) GetSettings() Settings {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return *m.settings
}

// buildTransport creates the shared http.Transport with SOCKS5 proxy if enabled.
// Must be called under m.mu write lock.
func (m *Manager) buildTransport() {
	t := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ForceAttemptHTTP2: true,
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
	}

	if m.settings.Socks5Enabled && m.settings.Socks5Address != "" {
		socks5URL := &url.URL{
			Scheme: "socks5",
			Host:   net.JoinHostPort(m.settings.Socks5Address, itoa(m.settings.Socks5Port)),
		}

		dialer, err := proxy.FromURL(socks5URL, proxy.Direct)
		if err != nil {
			m.logger.Error().Err(err).Msg("privacy: Failed to create SOCKS5 dialer, falling back to direct")
		} else {
			// Use the SOCKS5 dialer for all connections
			contextDialer, ok := dialer.(proxy.ContextDialer)
			if ok {
				t.DialContext = contextDialer.DialContext
			} else {
				// Wrap the plain dialer
				t.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
					return dialer.Dial(network, addr)
				}
			}
			m.logger.Info().Str("proxy", socks5URL.String()).Msg("privacy: SOCKS5 proxy configured")
		}
	}

	m.transport = t
}

// Transport returns the shared HTTP transport configured with privacy layers.
// This should be used by all HTTP clients in the application.
func (m *Manager) Transport() *http.Transport {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.transport
}

// ApplyGlobalTransport sets http.DefaultTransport to use the privacy transport.
// This ensures that all http.Get(), http.Post(), http.DefaultClient, and
// any http.Client{} without an explicit transport will route through SOCKS5.
func (m *Manager) ApplyGlobalTransport() {
	m.mu.RLock()
	defer m.mu.RUnlock()
	http.DefaultTransport = m.transport
	m.logger.Info().Msg("privacy: Global HTTP transport updated")
}

// GetDialContext returns the SOCKS5-aware DialContext function if SOCKS5 is enabled,
// or nil if not. This allows other packages with custom http.Transport to compose
// their own transport while still routing through the proxy.
func (m *Manager) GetDialContext() func(ctx context.Context, network, addr string) (net.Conn, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.transport != nil && m.transport.DialContext != nil {
		return m.transport.DialContext
	}
	return nil
}

// NewHTTPClient creates a new http.Client using the privacy transport with the given timeout.
func (m *Manager) NewHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Transport: m.Transport(),
		Timeout:   timeout,
	}
}

// DefaultHTTPClient returns an http.Client with 30s timeout using the privacy transport.
func (m *Manager) DefaultHTTPClient() *http.Client {
	return m.NewHTTPClient(30 * time.Second)
}

// ProxyTransport returns a transport suitable for the video proxy endpoint.
// It keeps InsecureSkipVerify for compatibility with various streaming sources.
func (m *Manager) ProxyTransport() *http.Transport {
	m.mu.RLock()
	base := m.transport.Clone()
	m.mu.RUnlock()

	base.TLSClientConfig = &tls.Config{
		InsecureSkipVerify: true,
		MinVersion:         tls.VersionTLS12,
	}
	base.ForceAttemptHTTP2 = false
	return base
}

// Shutdown cleans up all privacy layer resources.
func (m *Manager) Shutdown() {
	m.mu.Lock()
	defer m.mu.Unlock()

	if m.dohManager != nil {
		m.dohManager.Stop()
	}
	if m.dnsCryptManager != nil {
		m.dnsCryptManager.Stop()
	}
	if m.transport != nil {
		m.transport.CloseIdleConnections()
	}
}

func itoa(i int) string {
	return fmt.Sprintf("%d", i)
}

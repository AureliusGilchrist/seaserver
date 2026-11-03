package privacy

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"seanime/internal/database/models"
	"seanime/internal/goja/goja_bindings"
	"strings"
	"sync"
	"sync/atomic"
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

	// Fail mode for DNS. "open": when every DoH resolver is down, lookups fall back to the
	// system resolver. "closed": lookups are refused until a DoH resolver recovers, so no
	// query ever leaves in plain text. SOCKS5 never falls back to a direct connection in
	// either mode.
	FailMode string `json:"failMode"` // "open" or "closed"

	// TorrentEncryption controls BitTorrent protocol encryption (MSE/PE) for the built-in
	// torrent engines and qBittorrent. "prefer": encrypt whenever the peer supports it, fall
	// back to plain for peers that don't. "require": only talk to peers that encrypt.
	TorrentEncryption string `json:"torrentEncryption"` // "prefer" or "require"
}

const (
	TorrentEncryptionPrefer  = "prefer"
	TorrentEncryptionRequire = "require"
)

// Normalize fills in defaults and clamps enum fields to known values.
func (s *Settings) Normalize() {
	if s.FailMode != "open" && s.FailMode != "closed" {
		s.FailMode = "open"
	}
	if s.TorrentEncryption != TorrentEncryptionRequire {
		s.TorrentEncryption = TorrentEncryptionPrefer
	}
	if s.Socks5Port <= 0 || s.Socks5Port > 65535 {
		s.Socks5Port = 1080
	}
	cleaned := make([]string, 0, len(s.DoHProviders))
	for _, p := range s.DoHProviders {
		p = strings.TrimSpace(p)
		// DoH endpoints must be HTTPS: a plain-HTTP "DoH" URL would send every lookup in clear.
		if strings.HasPrefix(strings.ToLower(p), "https://") {
			cleaned = append(cleaned, p)
		}
	}
	s.DoHProviders = cleaned
}

// SettingsFromModel converts the stored database row into Settings.
func SettingsFromModel(row *models.PrivacySettings) *Settings {
	providers := []string{}
	for _, p := range strings.Split(row.DoHProviders, ",") {
		if p = strings.TrimSpace(p); p != "" {
			providers = append(providers, p)
		}
	}
	s := &Settings{
		DoHEnabled:        row.DoHEnabled,
		DoHProviders:      providers,
		Socks5Enabled:     row.Socks5Enabled,
		Socks5Address:     row.Socks5Address,
		Socks5Port:        row.Socks5Port,
		DNSCryptEnabled:   row.DNSCryptEnabled,
		FailMode:          row.FailMode,
		TorrentEncryption: row.TorrentEncryption,
	}
	s.Normalize()
	return s
}

// ToModel converts Settings into the database row (ID 1).
func (s *Settings) ToModel() *models.PrivacySettings {
	row := &models.PrivacySettings{
		DoHEnabled:        s.DoHEnabled,
		DoHProviders:      strings.Join(s.DoHProviders, ","),
		Socks5Enabled:     s.Socks5Enabled,
		Socks5Address:     s.Socks5Address,
		Socks5Port:        s.Socks5Port,
		DNSCryptEnabled:   s.DNSCryptEnabled,
		FailMode:          s.FailMode,
		TorrentEncryption: s.TorrentEncryption,
	}
	row.ID = 1
	return row
}

// DefaultSettings returns the privacy settings used until the user saves their own.
// DNS-over-HTTPS is on (fail-open, so a blocked resolver never takes the app offline) and
// torrents prefer encrypted peers; SOCKS5 and DNSCrypt need local setup and stay off.
func DefaultSettings() *Settings {
	return &Settings{
		DoHEnabled: true,
		// One resolver by default. The user picks from KnownProviders() in the
		// settings UI; if it goes down the manager falls back to the system
		// resolver rather than silently using a different operator.
		DoHProviders:      []string{knownProviders[0].URL},
		Socks5Enabled:     false,
		Socks5Address:     "127.0.0.1",
		Socks5Port:        1080,
		DNSCryptEnabled:   false,
		FailMode:          "open",
		TorrentEncryption: TorrentEncryptionPrefer,
	}
}

// current is the process-wide manager, so packages that build their own network stacks
// (the torrent engines, the qBittorrent client) can follow the same privacy settings
// without threading the manager through every constructor.
var current atomic.Pointer[Manager]

// Current returns the process-wide privacy manager, or nil before one is created.
func Current() *Manager {
	return current.Load()
}

func NewManager(logger *zerolog.Logger) *Manager {
	m := &Manager{
		logger:   logger,
		settings: DefaultSettings(),
	}
	m.buildTransport()
	current.Store(m)
	return m
}

// UpdateSettings applies new privacy settings and rebuilds the transport.
func (m *Manager) UpdateSettings(s *Settings) {
	m.mu.Lock()
	defer m.mu.Unlock()

	s.Normalize()
	m.settings = s
	m.buildTransport()

	// (Re-)start DoH if settings changed
	if m.dohManager != nil {
		m.dohManager.Stop()
	}
	if s.DoHEnabled && len(s.DoHProviders) > 0 {
		m.dohManager = NewDoHManager(s.DoHProviders, s.FailMode == "closed", m.logger)
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
		Str("torrentEncryption", s.TorrentEncryption).
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
		MaxIdleConns:          100,
		MaxIdleConnsPerHost:   10,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ForceAttemptHTTP2:     true,
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
		},
	}

	direct := &net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}

	if m.settings.Socks5Enabled && m.settings.Socks5Address != "" {
		socks5URL := &url.URL{
			Scheme: "socks5",
			Host:   net.JoinHostPort(m.settings.Socks5Address, itoa(m.settings.Socks5Port)),
		}

		dialer, err := proxy.FromURL(socks5URL, direct)
		if err != nil {
			m.logger.Error().Err(err).Msg("privacy: Failed to create SOCKS5 dialer, falling back to direct")
		} else {
			// The SOCKS5 dialer hands the hostname to the proxy, so names are resolved on the
			// far side of the tunnel and never reach a local resolver.
			var socksDial func(ctx context.Context, network, addr string) (net.Conn, error)
			if contextDialer, ok := dialer.(proxy.ContextDialer); ok {
				socksDial = contextDialer.DialContext
			} else {
				socksDial = func(ctx context.Context, network, addr string) (net.Conn, error) {
					return dialer.Dial(network, addr)
				}
			}
			// Local services (qBittorrent on localhost, a NAS on the LAN, the media player's
			// API) can't be reached from the proxy's exit, and sending them there would leak
			// the LAN layout to the proxy. They are dialled directly.
			t.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
				if IsLocalAddress(addr) {
					return direct.DialContext(ctx, network, addr)
				}
				return socksDial(ctx, network, addr)
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

// TorrentEncryptionRequired reports whether torrent peers must use protocol encryption.
func (m *Manager) TorrentEncryptionRequired() bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.settings.TorrentEncryption == TorrentEncryptionRequire
}

// IsLocalAddress reports whether a host or host:port points at this machine or the local
// network: loopback, private (RFC 1918 / ULA), link-local and unspecified IPs, "localhost",
// mDNS/LAN suffixes, and single-label names. Hostnames are judged by their spelling only and
// never resolved, so the check itself can't leak a lookup.
func IsLocalAddress(addr string) bool {
	host := addr
	if h, _, err := net.SplitHostPort(addr); err == nil {
		host = h
	}
	host = strings.TrimSuffix(strings.ToLower(strings.Trim(host, "[]")), ".")
	if host == "" {
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified()
	}
	if host == "localhost" || !strings.Contains(host, ".") {
		return true
	}
	for _, suffix := range []string{".localhost", ".local", ".lan", ".home.arpa", ".internal"} {
		if strings.HasSuffix(host, suffix) {
			return true
		}
	}
	return false
}

func itoa(i int) string {
	return fmt.Sprintf("%d", i)
}

package privacy

import (
	"context"
	"net"
	"net/url"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ncruces/go-dns"
	"github.com/rs/zerolog"
)

// DoHManager manages DNS-over-HTTPS with multiple providers and automatic failover.
type DoHManager struct {
	providers      []string
	logger         *zerolog.Logger
	activeIndex    atomic.Int32
	resolvers      []*net.Resolver
	systemResolver *net.Resolver
	stopCh         chan struct{}
	stopped        atomic.Bool
	mu             sync.RWMutex
}

// probeTimeout bounds each resolver health check.
const probeTimeout = 3 * time.Second

// systemResolver is the OS resolver captured before any DoH resolver replaces
// net.DefaultResolver, so failover can always fall back to it.
var systemResolver = net.DefaultResolver

// bootstrapAddrs pins the IPs of well-known DoH endpoints so the resolver never
// has to resolve its own hostname through the resolver it is replacing.
// Hostnames absent from this map still work: the resolver falls back to
// resolving its own endpoint through the system resolver at construction.
var bootstrapAddrs = map[string][]string{
	// Security-filtering
	"dns.quad9.net":               {"9.9.9.9", "149.112.112.112"},
	"security.cloudflare-dns.com": {"1.1.1.2", "1.0.0.2"},
	"dns.adguard-dns.com":         {"94.140.14.14", "94.140.15.15"},
	"doh.cleanbrowsing.org":       {"185.228.168.9", "185.228.169.9"},
	"doh.opendns.com":             {"208.67.222.222", "208.67.220.220"},
	"family.cloudflare-dns.com":   {"1.1.1.3", "1.0.0.3"},
	// Unfiltered
	"dns.mullvad.net":    {"194.242.2.2"},
	"cloudflare-dns.com": {"1.1.1.1", "1.0.0.1"},
	"dns.google":         {"8.8.8.8", "8.8.4.4"},
	"dns.nextdns.io":     {"45.90.28.0", "45.90.30.0"},
}

func resolverOptions(providerURL string) []dns.DoHOption {
	opts := []dns.DoHOption{dns.DoHCache()}
	if u, err := url.Parse(providerURL); err == nil {
		if addrs, ok := bootstrapAddrs[u.Hostname()]; ok {
			opts = append(opts, dns.DoHAddresses(addrs...))
		}
	}
	return opts
}

// NewDoHManager creates a DoH manager with the given provider URLs.
// Providers are ordered by priority (first = primary).
func NewDoHManager(providers []string, logger *zerolog.Logger) *DoHManager {
	m := &DoHManager{
		providers: providers,
		logger:    logger,
		stopCh:    make(chan struct{}),
	}
	return m
}

// Start initializes all DoH resolvers and starts the health-check loop.
// This should be called in a goroutine.
func (m *DoHManager) Start() {
	m.mu.Lock()

	m.systemResolver = systemResolver

	m.resolvers = make([]*net.Resolver, 0, len(m.providers))
	for i, providerURL := range m.providers {
		resolver, err := dns.NewDoHResolver(providerURL, resolverOptions(providerURL)...)
		if err != nil {
			m.logger.Warn().Err(err).Str("provider", providerURL).Msg("privacy/doh: Failed to create resolver")
			continue
		}
		m.resolvers = append(m.resolvers, resolver)
		m.logger.Debug().Str("provider", providerURL).Int("index", i).Msg("privacy/doh: Resolver initialized")
	}

	if len(m.resolvers) == 0 {
		m.logger.Error().Msg("privacy/doh: No resolvers could be initialized")
		m.mu.Unlock()
		return
	}

	// Set the first working resolver as default
	m.activeIndex.Store(0)
	net.DefaultResolver = m.resolvers[0]
	m.logger.Info().Str("provider", m.providers[0]).Msg("privacy/doh: Active resolver set")

	m.mu.Unlock()

	// Verify the primary resolver works
	if !m.testResolver(0) {
		m.promote()
	}

	// Start health-check loop
	m.healthCheckLoop()
}

// Stop shuts down the health-check loop.
func (m *DoHManager) Stop() {
	if m.stopped.CompareAndSwap(false, true) {
		close(m.stopCh)
		m.mu.RLock()
		if m.systemResolver != nil {
			net.DefaultResolver = m.systemResolver
		}
		m.mu.RUnlock()
	}
}

// healthCheckLoop runs every 60 seconds, testing the active resolver and promoting if it fails.
func (m *DoHManager) healthCheckLoop() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopCh:
			return
		case <-ticker.C:
			idx := int(m.activeIndex.Load())
			if !m.testResolver(idx) {
				m.logger.Warn().
					Str("provider", m.providers[idx]).
					Msg("privacy/doh: Active resolver failed health check, promoting backup")
				m.promote()
			}
		}
	}
}

// testResolver performs a DNS lookup to verify the resolver at the given index works.
func (m *DoHManager) testResolver(index int) bool {
	m.mu.RLock()
	if index >= len(m.resolvers) {
		m.mu.RUnlock()
		return false
	}
	resolver := m.resolvers[index]
	m.mu.RUnlock()

	ctx, cancel := context.WithTimeout(context.Background(), probeTimeout)
	defer cancel()

	_, err := resolver.LookupIPAddr(ctx, "dns.google")
	return err == nil
}

// promote finds the next working resolver and sets it as the active one.
func (m *DoHManager) promote() {
	m.mu.RLock()
	resolverCount := len(m.resolvers)
	m.mu.RUnlock()

	currentIdx := int(m.activeIndex.Load())

	// Hand DNS back to the system resolver up front. Probing every provider can
	// take resolverCount*probeTimeout, and leaving a known-dead resolver
	// installed for that long would stall every outgoing request in the app.
	m.mu.RLock()
	net.DefaultResolver = m.systemResolver
	m.mu.RUnlock()

	// <= so the current index is retried last: after a fallback to the system
	// resolver it is otherwise never re-adopted.
	for i := 1; i <= resolverCount; i++ {
		nextIdx := (currentIdx + i) % resolverCount
		if m.testResolver(nextIdx) {
			m.mu.RLock()
			net.DefaultResolver = m.resolvers[nextIdx]
			m.mu.RUnlock()

			m.activeIndex.Store(int32(nextIdx))
			m.logger.Info().
				Str("provider", m.providers[nextIdx]).
				Msg("privacy/doh: Promoted backup resolver to active")
			return
		}
	}

	m.logger.Error().Msg("privacy/doh: All DoH resolvers failed, using the system resolver until one recovers")
}

// ActiveProvider returns the URL of the currently active DoH provider.
func (m *DoHManager) ActiveProvider() string {
	idx := int(m.activeIndex.Load())
	if idx < len(m.providers) {
		return m.providers[idx]
	}
	return ""
}

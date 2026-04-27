package privacy

import (
	"context"
	"net"
	"net/http"
	"time"
)

// PrivacyStatus is the API response for the current state of all privacy layers.
type PrivacyStatus struct {
	Settings          Settings         `json:"settings"`
	DNSCrypt          DNSCryptStatus   `json:"dnsCrypt"`
	ActiveDoHProvider string           `json:"activeDoHProvider"`
}

// ConnectionTestResult reports whether each privacy layer is functioning.
type ConnectionTestResult struct {
	DoHWorking      bool   `json:"dohWorking"`
	DoHProvider     string `json:"dohProvider"`
	Socks5Working   bool   `json:"socks5Working"`
	DNSCryptRunning bool   `json:"dnsCryptRunning"`
}

// GetDNSCryptStatus returns the current DNSCrypt-proxy status.
func (m *Manager) GetDNSCryptStatus() DNSCryptStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.dnsCryptManager == nil {
		return DNSCryptStatus{}
	}
	return m.dnsCryptManager.Status()
}

// GetActiveDoHProvider returns the currently active DoH provider URL.
func (m *Manager) GetActiveDoHProvider() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.dohManager == nil {
		return ""
	}
	return m.dohManager.ActiveProvider()
}

// TestConnection tests all active privacy layers and returns results.
func (m *Manager) TestConnection() ConnectionTestResult {
	result := ConnectionTestResult{}

	m.mu.RLock()
	settings := *m.settings
	m.mu.RUnlock()

	// Test DoH
	if settings.DoHEnabled {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, err := net.DefaultResolver.LookupIPAddr(ctx, "dns.google")
		result.DoHWorking = err == nil
		result.DoHProvider = m.GetActiveDoHProvider()
	}

	// Test SOCKS5
	if settings.Socks5Enabled {
		client := m.NewHTTPClient(10 * time.Second)
		req, err := http.NewRequest("HEAD", "https://am.i.mullvad.net/connected", nil)
		if err == nil {
			resp, err := client.Do(req)
			if err == nil {
				resp.Body.Close()
				result.Socks5Working = resp.StatusCode == http.StatusOK
			}
		}
	}

	// Test DNSCrypt
	if settings.DNSCryptEnabled {
		m.mu.RLock()
		if m.dnsCryptManager != nil {
			result.DNSCryptRunning = m.dnsCryptManager.IsRunning()
		}
		m.mu.RUnlock()
	}

	return result
}

// InstallDNSCrypt delegates to the DNSCrypt manager to install dnscrypt-proxy.
func (m *Manager) InstallDNSCrypt() error {
	m.mu.Lock()
	if m.dnsCryptManager == nil {
		m.dnsCryptManager = NewDNSCryptManager(m.logger)
	}
	mgr := m.dnsCryptManager
	m.mu.Unlock()

	return mgr.Install()
}

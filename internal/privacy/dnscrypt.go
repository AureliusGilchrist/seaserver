package privacy

import (
	"errors"
	"os/exec"
	"sync/atomic"

	"github.com/rs/zerolog"
)

// DNSCryptManager handles installation and lifecycle of dnscrypt-proxy on Fedora.
type DNSCryptManager struct {
	logger  *zerolog.Logger
	running atomic.Bool
}

// NewDNSCryptManager creates a new DNSCrypt-proxy manager.
func NewDNSCryptManager(logger *zerolog.Logger) *DNSCryptManager {
	return &DNSCryptManager{
		logger: logger,
	}
}

// Start checks if dnscrypt-proxy is installed and running. If not installed, it logs guidance.
// If installed but not running, it attempts to start the service.
func (m *DNSCryptManager) Start() {
	// Check if dnscrypt-proxy binary exists
	if !m.isInstalled() {
		m.logger.Warn().Msg("privacy/dnscrypt: dnscrypt-proxy is not installed. Install with: sudo dnf install -y dnscrypt-proxy")
		return
	}

	// Check if the service is already running
	if m.isRunning() {
		m.running.Store(true)
		m.logger.Info().Msg("privacy/dnscrypt: dnscrypt-proxy service is already running")
		return
	}

	// Try to start the service
	m.logger.Info().Msg("privacy/dnscrypt: Attempting to start dnscrypt-proxy service")
	if err := m.startService(); err != nil {
		m.logger.Warn().Err(err).Msg("privacy/dnscrypt: Failed to start dnscrypt-proxy. You may need to run: sudo systemctl enable --now dnscrypt-proxy")
		return
	}

	m.running.Store(true)
	m.logger.Info().Msg("privacy/dnscrypt: dnscrypt-proxy service started")
}

// Stop does not actually stop the system service (that would be destructive).
// It just marks the manager as inactive.
func (m *DNSCryptManager) Stop() {
	m.running.Store(false)
}

// IsRunning returns whether the DNSCrypt service is known to be active.
func (m *DNSCryptManager) IsRunning() bool {
	return m.running.Load()
}

// IsInstalled checks if dnscrypt-proxy is available on the system.
func (m *DNSCryptManager) IsInstalled() bool {
	return m.isInstalled()
}

func (m *DNSCryptManager) isInstalled() bool {
	_, err := exec.LookPath("dnscrypt-proxy")
	return err == nil
}

func (m *DNSCryptManager) isRunning() bool {
	cmd := exec.Command("systemctl", "is-active", "--quiet", "dnscrypt-proxy")
	return cmd.Run() == nil
}

// startService starts the dnscrypt-proxy service.
//
// Starting a system service is a root privilege, and the server is deliberately not run as one —
// so the elevation happens on the command itself, in the order anything like this is tried:
// directly first (which works when polkit's rules let a user session manage the service), then
// through sudo non-interactively.
//
// `sudo -n` is the whole reason this does not hang: it fails immediately when a password would be
// required, and a background server sitting on a prompt nobody can type into is the worst outcome
// this could have. It succeeds when sudoers carries a NOPASSWD rule for this one command — the
// one-line setup that makes the elevation automatic from then on, without the server itself ever
// being started as root.
func (m *DNSCryptManager) startService() error {
	// Direct: the server runs as root, or polkit already allows a user session to manage the
	// service.
	if err := exec.Command("systemctl", "start", "dnscrypt-proxy").Run(); err == nil {
		return nil
	}

	// sudo, non-interactive: fails immediately rather than asking for a password.
	if err := exec.Command("sudo", "-n", "systemctl", "start", "dnscrypt-proxy").Run(); err == nil {
		return nil
	}

	return errors.New(
		"could not start the dnscrypt-proxy service — start the server as root, or allow it once " +
			"with a sudoers rule: <your user> ALL=(ALL) NOPASSWD: /usr/bin/systemctl start dnscrypt-proxy " +
			"(sudo visudo -f /etc/sudoers.d/seanime-dnscrypt)")
}

// Install attempts to install dnscrypt-proxy using dnf.
// This requires root privileges and will fail without sudo.
func (m *DNSCryptManager) Install() error {
	m.logger.Info().Msg("privacy/dnscrypt: Installing dnscrypt-proxy via dnf")
	cmd := exec.Command("sudo", "dnf", "install", "-y", "dnscrypt-proxy")
	output, err := cmd.CombinedOutput()
	if err != nil {
		m.logger.Error().Err(err).Str("output", string(output)).Msg("privacy/dnscrypt: Installation failed")
		return err
	}

	// Enable and start the service
	enableCmd := exec.Command("sudo", "systemctl", "enable", "--now", "dnscrypt-proxy")
	if enableOutput, enableErr := enableCmd.CombinedOutput(); enableErr != nil {
		m.logger.Warn().Err(enableErr).Str("output", string(enableOutput)).Msg("privacy/dnscrypt: Failed to enable service")
		return enableErr
	}

	m.running.Store(true)
	m.logger.Info().Msg("privacy/dnscrypt: Installation and service startup complete")
	return nil
}

// Status returns the current status of DNSCrypt-proxy.
func (m *DNSCryptManager) Status() DNSCryptStatus {
	return DNSCryptStatus{
		Installed: m.isInstalled(),
		Running:   m.isRunning(),
	}
}

// DNSCryptStatus reports the current state of the DNSCrypt-proxy service.
type DNSCryptStatus struct {
	Installed bool `json:"installed"`
	Running   bool `json:"running"`
}

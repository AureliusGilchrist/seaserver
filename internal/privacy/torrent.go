package privacy

import (
	"github.com/anacrolix/torrent"
)

// ApplyTorrentConfig points a built-in torrent engine at the privacy settings:
//
//   - Protocol encryption (MSE/PE) is always preferred, so the handshake and payload are
//     obfuscated whenever the peer supports it. With TorrentEncryption "require", plain peers
//     are refused outright.
//   - With SOCKS5 on, HTTP tracker announces and metadata/webseed fetches go through the
//     proxy, so trackers see the proxy's address rather than this machine's.
//
// DNS for trackers and DHT bootstrap needs nothing here: the engine resolves through
// net.DefaultResolver, which the DoH manager already replaces.
//
// It must be called before torrent.NewClient. A nil cfg or a missing manager is a no-op.
func ApplyTorrentConfig(cfg *torrent.ClientConfig) {
	if cfg == nil {
		return
	}
	cfg.HeaderObfuscationPolicy.Preferred = true

	m := Current()
	if m == nil {
		return
	}

	cfg.HeaderObfuscationPolicy.RequirePreferred = m.TorrentEncryptionRequired()

	if dial := m.GetDialContext(); dial != nil {
		cfg.TrackerDialContext = dial
		cfg.HTTPDialContext = dial
	}
}

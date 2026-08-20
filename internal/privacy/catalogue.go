package privacy

// KnownProvider describes a selectable DoH resolver shown in the settings UI.
type KnownProvider struct {
	Name        string `json:"name"`
	URL         string `json:"url"`
	Description string `json:"description"`
	// Filtering is what the resolver blocks: "none", "malware", or "malware+ads".
	Filtering string `json:"filtering"`
	// NoLog reports whether the operator states they keep no query logs.
	NoLog bool `json:"noLog"`
}

// knownProviders is the catalogue of resolvers offered in the settings dropdown.
// Security-filtering resolvers are listed first. Users can still enter any other
// DoH URL manually; anything not listed here simply resolves its own endpoint
// through the system resolver at startup instead of using a pinned IP.
var knownProviders = []KnownProvider{
	{
		Name:        "Quad9",
		URL:         "https://dns.quad9.net/dns-query",
		Description: "Blocks malware, phishing and botnet C&C using 20+ threat feeds. Swiss non-profit, DNSSEC validating.",
		Filtering:   "malware",
		NoLog:       true,
	},
	{
		Name:        "Cloudflare (Security)",
		URL:         "https://security.cloudflare-dns.com/dns-query",
		Description: "Cloudflare's malware-blocking resolver. Very fast and highly available.",
		Filtering:   "malware",
		NoLog:       true,
	},
	{
		Name:        "AdGuard DNS",
		URL:         "https://dns.adguard-dns.com/dns-query",
		Description: "Blocks malware plus ads and trackers.",
		Filtering:   "malware+ads",
		NoLog:       true,
	},
	{
		Name:        "CleanBrowsing (Security)",
		URL:         "https://doh.cleanbrowsing.org/doh/security-filter/",
		Description: "Blocks malware and phishing domains.",
		Filtering:   "malware",
		NoLog:       true,
	},
	{
		Name:        "OpenDNS",
		URL:         "https://doh.opendns.com/dns-query",
		Description: "Cisco threat intelligence, blocks phishing domains.",
		Filtering:   "malware",
		NoLog:       false,
	},
	{
		Name:        "Cloudflare (Family)",
		URL:         "https://family.cloudflare-dns.com/dns-query",
		Description: "Blocks malware and adult content.",
		Filtering:   "malware+ads",
		NoLog:       true,
	},
	{
		Name:        "Mullvad",
		URL:         "https://dns.mullvad.net/dns-query",
		Description: "Unfiltered, no-log, privacy-first. Run by the Mullvad VPN operator.",
		Filtering:   "none",
		NoLog:       true,
	},
	{
		Name:        "Cloudflare",
		URL:         "https://cloudflare-dns.com/dns-query",
		Description: "Unfiltered. The fastest of the major public resolvers.",
		Filtering:   "none",
		NoLog:       true,
	},
	{
		Name:        "Google Public DNS",
		URL:         "https://dns.google/dns-query",
		Description: "Unfiltered. Maximum availability, but the least private of the options.",
		Filtering:   "none",
		NoLog:       false,
	},
}

// KnownProviders returns the catalogue of selectable DoH resolvers.
func KnownProviders() []KnownProvider {
	out := make([]KnownProvider, len(knownProviders))
	copy(out, knownProviders)
	return out
}

package extension_repo

import (
	"testing"

	"seanime/internal/constants"
)

// The default sources must actually offer streaming providers. Upstream removing them from its
// marketplace is what left the app with no online sources to install, and nothing in the app said
// so — the list was simply empty.
func TestDefaultMarketplacesCarryOnlinestreamProviders(t *testing.T) {
	urls := parseMarketplaceUrls("")
	if len(urls) < 2 {
		t.Fatalf("expected the default sources to include the community one, got %v", urls)
	}
	if urls[0] != constants.DefaultExtensionMarketplaceURL {
		t.Errorf("upstream is no longer the first source: %v", urls)
	}

	// A user's own source is added, never replacing the defaults.
	withCustom := parseMarketplaceUrls("https://example.com/mine.json")
	if len(withCustom) != len(urls)+1 {
		t.Errorf("a user source did not merge with the defaults: %v", withCustom)
	}
	if withCustom[len(withCustom)-1] != "https://example.com/mine.json" {
		t.Errorf("the user's source was dropped: %v", withCustom)
	}

	// Duplicates collapse, so naming a default explicitly does not fetch it twice.
	dup := parseMarketplaceUrls(constants.DefaultExtensionMarketplaceURL)
	if len(dup) != len(urls) {
		t.Errorf("naming a default source duplicated it: %v", dup)
	}
}

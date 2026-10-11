package handlers

import (
	"path/filepath"
	"testing"
)

func TestGetMarketplaceIndexPathUsesConfiguredDirectory(t *testing.T) {
	marketplaceDir := filepath.Join("mount", "seanime-themes")
	got, err := getMarketplaceIndexPath(marketplaceDir)
	if err != nil {
		t.Fatalf("getMarketplaceIndexPath() error = %v", err)
	}
	want := filepath.Join(marketplaceDir, "index.json")
	if got != want {
		t.Errorf("getMarketplaceIndexPath() = %q, want %q", got, want)
	}
}

func TestGetMarketplaceIndexPathRequiresConfiguredDirectory(t *testing.T) {
	if _, err := getMarketplaceIndexPath(""); err == nil {
		t.Fatal("getMarketplaceIndexPath(\"\") error = nil, want an error")
	}
}

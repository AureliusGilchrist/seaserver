package core

import "testing"

func TestShouldSkipWebStaticForBackendFiles(t *testing.T) {
	paths := []string{
		"/api/v1/status",
		"/events/ws",
		"/shared-themes/bleach/theme.json",
		"/marketplace/themes/bleach/theme.json",
		"/theme-bg/bleach/background.jpg",
		"/marketplace-cursor-packs/pack/preview.png",
	}
	for _, path := range paths {
		if !shouldSkipWebStatic(path) {
			t.Errorf("shouldSkipWebStatic(%q) = false, want true", path)
		}
	}
}

func TestShouldNotSkipWebStaticForWebRoutes(t *testing.T) {
	paths := []string{"/", "/profile", "/marketplace-extra"}
	for _, path := range paths {
		if shouldSkipWebStatic(path) {
			t.Errorf("shouldSkipWebStatic(%q) = true, want false", path)
		}
	}
}

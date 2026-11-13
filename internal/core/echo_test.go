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

func TestSharedThemeIDFromPath(t *testing.T) {
	cases := map[string]string{
		"/shared-themes/bleach/theme.json":           "bleach",
		"/shared-themes/Ranking of Kings/theme.json": "Ranking of Kings",
	}
	for path, want := range cases {
		if got, ok := sharedThemeIDFromPath(path); !ok || got != want {
			t.Errorf("%s: got %q %v, want %q", path, got, ok, want)
		}
	}
	for _, path := range []string{"/shared-themes/bleach/bg.png", "/shared-themes/bleach", "/marketplace/themes/bleach/theme.json", "/shared-themes/../x/theme.json"} {
		if _, ok := sharedThemeIDFromPath(path); ok {
			t.Errorf("%s: matched, want no match", path)
		}
	}
}

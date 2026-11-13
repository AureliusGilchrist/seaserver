package core

import (
	"seanime/internal/sharedthemes"
	"strings"

	"github.com/labstack/echo/v4"
)

// refreshSharedThemeMiddleware refreshes an installed theme from the marketplace when its
// theme.json is requested (/shared-themes/<id>/theme.json), so the static handler that follows
// serves the current copy. Any other path passes straight through. A failed refresh is logged
// and the old copy is served.
func refreshSharedThemeMiddleware(marketplaceDir, sharedDir string, onError func(id string, err error)) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if marketplaceDir != "" {
				if id, ok := sharedThemeIDFromPath(c.Request().URL.Path); ok {
					if _, err := sharedthemes.Refresh(marketplaceDir, sharedDir, id); err != nil && onError != nil {
						onError(id, err)
					}
				}
			}
			return next(c)
		}
	}
}

// sharedThemeIDFromPath returns <id> for "/shared-themes/<id>/theme.json".
func sharedThemeIDFromPath(path string) (string, bool) {
	rest, ok := strings.CutPrefix(path, "/shared-themes/")
	if !ok {
		return "", false
	}
	id, file, ok := strings.Cut(rest, "/")
	if !ok || file != "theme.json" || !sharedthemes.ValidID(id) {
		return "", false
	}
	return id, true
}

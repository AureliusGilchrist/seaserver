package core

import (
	"seanime/internal/api/metadata_provider"
	"seanime/internal/platforms/anilist_platform"

	"github.com/spf13/viper"
)

// SetOfflineMode is a no-op for offline=true.
// Offline-first behaviour is now handled transparently by the CacheLayer
// (SQLite + file cache fallback), so the OfflinePlatform is no longer needed.
// Calling with enabled=false still cleanly resets any stale config.
func (a *App) SetOfflineMode(enabled bool) {
	if enabled {
		// Silently refuse — log a warning and stay on AnilistPlatform
		a.Logger.Warn().Msg("app: Offline mode requested but is disabled; using cache-backed AnilistPlatform instead")
		return
	}

	// Ensure the config is persisted as false
	a.Config.Server.Offline = false
	viper.Set("server.offline", false)
	if err := viper.WriteConfig(); err != nil {
		a.Logger.Err(err).Msg("app: Failed to write config after clearing offline mode")
	}
	a.isOfflineRef.Set(false)

	if a.AnilistPlatformRef.IsPresent() {
		a.AnilistPlatformRef.Get().Close()
	}
	if a.MetadataProviderRef.IsPresent() {
		a.MetadataProviderRef.Get().Close()
	}

	anilistPlatform := anilist_platform.NewAnilistPlatform(a.AnilistClientRef, a.ExtensionBankRef, a.Logger, a.Database)
	a.AnilistPlatformRef.Set(anilistPlatform)
	a.MetadataProviderRef.Set(metadata_provider.NewProvider(&metadata_provider.NewProviderImplOptions{
		Logger:           a.Logger,
		FileCacher:       a.FileCacher,
		ExtensionBankRef: a.ExtensionBankRef,
		Database:         a.Database,
	}))

	a.AddOnRefreshAnilistCollectionFunc("anilist-platform", func() {
		a.AnilistPlatformRef.Get().ClearCache()
	})

	a.InitOrRefreshAnilistData()
	a.InitOrRefreshModules()

	a.Logger.Info().Msg("app: Switched to cache-backed AnilistPlatform")
}

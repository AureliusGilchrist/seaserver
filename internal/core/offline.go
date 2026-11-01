package core

import (
	"seanime/internal/connectivity"

	"github.com/spf13/viper"
)

// SetOfflineMode is the sidebar's switch. It stays on across restarts, and turning it off hands
// back to the real connection.
func (a *App) SetOfflineMode(enabled bool) {
	connectivity.SetForcedOffline(enabled)

	// Only the saved value: the running config's flag selects the old offline screens.
	viper.Set("server.offline", enabled)
	if err := viper.WriteConfig(); err != nil {
		a.Logger.Err(err).Msg("app: Failed to save offline mode")
	}
}

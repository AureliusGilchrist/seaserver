package core

// AutoUpdateProgressEnabledFor reports whether AniList progress should be written automatically for a
// profile: the profile's Personal override when it has one, otherwise the server-wide setting.
//
// The client already reads it this way. Server-side trackers read only the server-wide value, so the
// two disagreed whenever a profile had changed it, and progress was synced from one place and not the
// other.
func (a *App) AutoUpdateProgressEnabledFor(profileID uint) bool {
	enabled := false
	if a.Database != nil {
		if v, err := a.Database.AutoUpdateProgressIsEnabled(); err == nil {
			enabled = v
		}
	}
	if profileID == 0 || a.ProfileDatabaseManager == nil {
		return enabled
	}
	pdb, err := a.ProfileDatabaseManager.GetDatabase(profileID)
	if err != nil || pdb == nil {
		return enabled
	}
	ovr, err := pdb.GetClientSettingsOverrides()
	if err != nil || ovr == nil || ovr.AutoUpdateProgress == nil {
		return enabled
	}
	return *ovr.AutoUpdateProgress
}

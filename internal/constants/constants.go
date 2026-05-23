package constants

import (
	"encoding/json"
	"seanime/internal/util"
	"time"
)

// Version, VersionName and SeanimeRoomsVersion are populated from versions.json
// at startup via SetVersionsFromJSON. Defaults below are used as fallback if the
// manifest is missing or malformed.
var (
	Version             = "2.3.0-6"
	VersionName         = "Karasu"
	SeanimeRoomsVersion = "2.3.0-6"
)

const (
	GcTime               = time.Minute * 30
	ConfigFileName       = "config.toml"
	MalClientId          = "51cb4294feb400f3ddc66a30f9b9a00f"
	DiscordApplicationId = "1224777421941899285"
	AnilistApiUrl        = "https://graphql.anilist.co"
	IsRspackFrontend     = true
)

const (
	SeanimeRoomsApiUrl   = "https://seanime.app/api/rooms"
	SeanimeRoomsApiWsUrl = "wss://seanime.app/api/rooms"
)

// VersionsManifest mirrors the structure of versions.json at the repo root. Only the
// fields the Go server cares about are decoded here; additional keys are ignored.
type VersionsManifest struct {
	Seaserver struct {
		Version  string `json:"version"`
		Codename string `json:"codename"`
	} `json:"seaserver"`
	Rooms struct {
		Version string `json:"version"`
	} `json:"rooms"`
}

// SetVersionsFromJSON overrides the package-level version variables from the embedded
// versions.json manifest. Any field that is empty in the manifest is left at its
// default value. Returns an error only if the JSON is malformed; missing fields are not
// treated as errors so partial manifests still work.
func SetVersionsFromJSON(data []byte) error {
	if len(data) == 0 {
		return nil
	}
	var m VersionsManifest
	if err := json.Unmarshal(data, &m); err != nil {
		return err
	}
	if m.Seaserver.Version != "" {
		Version = m.Seaserver.Version
	}
	if m.Seaserver.Codename != "" {
		VersionName = m.Seaserver.Codename
	}
	if m.Rooms.Version != "" {
		SeanimeRoomsVersion = m.Rooms.Version
	}
	return nil
}

var DefaultExtensionMarketplaceURL = util.Decode("aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tLzVyYWhpbS9zZWFuaW1lLWV4dGVuc2lvbnMvcmVmcy9oZWFkcy9tYWluL21hcmtldHBsYWNlLmpzb24=")
var AnnouncementURL = util.Decode("aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tLzVyYWhpbS9oaWJpa2UvcmVmcy9oZWFkcy9tYWluL3B1YmxpYy9hbm5vdW5jZW1lbnRzLmpzb24=")
var InternalMetadataURL = util.Decode("aHR0cHM6Ly9hbmltZS5jbGFwLmluZw==")

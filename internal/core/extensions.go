package core

import (
	"encoding/json"
	"seanime/internal/extension"
	"seanime/internal/extension_repo"
	manga_providers "seanime/internal/manga/providers"
	torrent_providers "seanime/internal/torrents/providers"

	"github.com/rs/zerolog"
)

var defaultAnimeTorrentProviderManifestURIs = []string{
	"https://island.clap.ing/api/extensions/anime-torrent-providers/animetosho/animetosho.json",
	"https://island.clap.ing/api/extensions/anime-torrent-providers/seadex/seadex.json",
	"https://raw.githubusercontent.com/Bas1874/SubsPleaseSeanime/refs/heads/main/src/manifest.json",
	"https://raw.githubusercontent.com/Bas1874/Tokyotosho-Torrent-Provider-Seanime/main/src/tokyotosho/manifest.json",
	"https://raw.githubusercontent.com/Bas1874/ACG.RIP-Torrent-Provider-Seanime/refs/heads/main/src/manifest.json",
	"https://island.clap.ing/api/extensions/anime-torrent-providers/nyaa-sukebei/nyaa-sukebei.json",
}

func LoadCustomSourceExtensions(extensionRepository *extension_repo.Repository) {
	extensionRepository.LoadOnlyWrapper([]extension.Type{extension.TypeCustomSource}, func() {
		extensionRepository.ReloadExternalExtensions()
	})
}

func LoadExtensions(extensionRepository *extension_repo.Repository, logger *zerolog.Logger, config *Config) {
	// Load built-in extensions
	extensionRepository.ReloadBuiltInExtension(extension.Extension{
		ID:          manga_providers.LocalProvider,
		Name:        "Local",
		Version:     "",
		ManifestURI: "builtin",
		Language:    extension.LanguageGo,
		Type:        extension.TypeMangaProvider,
		Author:      "Seanime",
		Lang:        "multi",
		Icon:        "https://raw.githubusercontent.com/5rahim/hibike/main/icons/local-manga.png",
	}, manga_providers.NewLocal(config.Manga.LocalDir, logger))

	// Load built-in anime torrent providers
	extensionRepository.ReloadBuiltInExtension(extension.Extension{
		ID:          torrent_providers.NyaaProviderID,
		Name:        "Nyaa.si",
		Version:     "1.0.0",
		ManifestURI: "builtin",
		Language:    extension.LanguageGo,
		Type:        extension.TypeAnimeTorrentProvider,
		Author:      "Seanime",
		Description: "Anime torrent provider for nyaa.si (non-sukebei)",
		Lang:        "multi",
	}, torrent_providers.NewNyaa())

	extensionRepository.ReloadBuiltInExtension(extension.Extension{
		ID:          torrent_providers.NekoBTProviderID,
		Name:        "NekoBT",
		Version:     "1.0.0",
		ManifestURI: "builtin",
		Language:    extension.LanguageGo,
		Type:        extension.TypeAnimeTorrentProvider,
		Author:      "Seanime",
		Description: "Anime torrent provider for nekobt.to",
		Lang:        "multi",
	}, torrent_providers.NewNekoBT())

	extensionRepository.ReloadBuiltInExtension(extension.Extension{
		ID:          torrent_providers.ShanaProjectProviderID,
		Name:        "Shana Project",
		Version:     "1.0.0",
		ManifestURI: "builtin",
		Language:    extension.LanguageGo,
		Type:        extension.TypeAnimeTorrentProvider,
		Author:      "Seanime",
		Description: "Anime torrent provider for shanaproject.com",
		Lang:        "multi",
	}, torrent_providers.NewShanaProject())

	extensionRepository.ReloadBuiltInExtension(extension.Extension{
		ID:          torrent_providers.BakaBTProviderID,
		Name:        "BakaBT",
		Version:     "1.0.0",
		ManifestURI: "builtin",
		Language:    extension.LanguageGo,
		Type:        extension.TypeAnimeTorrentProvider,
		Author:      "Seanime",
		Description: "Anime torrent provider for bakabt.me (private tracker, requires login)",
		Lang:        "multi",
		UserConfig: &extension.UserConfig{
			Version:        1,
			RequiresConfig: true,
			Fields: []extension.ConfigField{
				{
					Type:  extension.ConfigFieldTypeText,
					Name:  "username",
					Label: "BakaBT Username",
				},
				{
					Type:  extension.ConfigFieldTypeText,
					Name:  "password",
					Label: "BakaBT Password",
				},
			},
		},
	}, torrent_providers.NewBakaBT())

	// Load external extensions
	//extensionRepository.ReloadExternalExtensions()
	extensionRepository.LoadOnlyWrapper([]extension.Type{extension.TypeMangaProvider, extension.TypeOnlinestreamProvider, extension.TypeAnimeTorrentProvider, extension.TypePlugin}, func() {
		extensionRepository.ReloadExternalExtensions()
	})

	ensureDefaultAnimeTorrentProviders(extensionRepository, logger)
}

func ensureDefaultAnimeTorrentProviders(extensionRepository *extension_repo.Repository, logger *zerolog.Logger) {
	repoPayload := struct {
		ManifestURIs []string `json:"urls"`
	}{
		ManifestURIs: defaultAnimeTorrentProviderManifestURIs,
	}

	b, err := json.Marshal(repoPayload)
	if err != nil {
		logger.Warn().Err(err).Msg("extensions: Failed to marshal default anime torrent provider repository payload")
		return
	}

	res, err := extensionRepository.InstallExternalExtensions(string(b), true)
	if err != nil {
		logger.Warn().Err(err).Msg("extensions: Failed to install default anime torrent providers")
		return
	}

	logger.Info().Int("count", len(res.Extensions)).Msg("extensions: Ensured default anime torrent providers are installed")
}

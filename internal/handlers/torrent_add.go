package handlers

import (
	"errors"
	"fmt"

	"seanime/internal/api/anilist"
	hibiketorrent "seanime/internal/extension/hibike/torrent"
	"seanime/internal/torrent_clients/torrent_client"
	"seanime/internal/unmatched"
)

// queuedTorrentMetadata is everything known about the anime a download is for, worked out once per
// request: the episode metadata is fetched here rather than in the middle of a match. Zero value
// when the download is not for a known anime.
func (h *Handler) queuedTorrentMetadata(media *anilist.BaseAnime) unmatched.TorrentMetadata {
	var md unmatched.TorrentMetadata
	if media == nil {
		return md
	}
	md = unmatched.TorrentMetadata{AnimeID: media.ID}
	if media.Title != nil {
		if media.Title.Romaji != nil {
			md.AnimeTitleRomaji = *media.Title.Romaji
		}
		if media.Title.Native != nil {
			md.AnimeTitleNative = *media.Title.Native
		}
	}
	if media.Format != nil {
		md.AnimeFormat = string(*media.Format)
	}
	if media.StartDate != nil && media.StartDate.Year != nil {
		md.AnimeStartYear = *media.StartDate.Year
	}
	// AniList's count for this exact entry — recorded so the Unmatched screen doesn't have to
	// fall back to the Animap map, which also counts specials and sibling seasons.
	if media.Episodes != nil {
		md.AnimeExpectedEpisodes = *media.Episodes
	}

	// The episode titles. Fetched now, so naming the files later is pure string work.
	h.App.UnmatchedRepository.EnrichMetadata(&md)
	return md
}

// addTorrentToClient sends one torrent to the client, into the unmatched directory, with its anime
// metadata saved first. Reports false with no error when the client already has it.
func (h *Handler) addTorrentToClient(
	repo *torrent_client.Repository,
	t hibiketorrent.AnimeTorrent,
	media *anilist.BaseAnime,
	queuedMetadata unmatched.TorrentMetadata,
	autoMatch bool,
	matchSeasonOneOnly bool,
) (bool, error) {
	// Each torrent goes to /zroot/torrents/Anime/Unmatched/$TorrentName
	destination := h.App.UnmatchedRepository.GetUnmatchedDestination(t.Name)

	providerExtension, ok := h.App.TorrentRepository.GetAnimeProviderExtension(t.Provider)
	if !ok {
		return false, errors.New("provider extension not found for torrent")
	}

	magnet, err := providerExtension.GetProvider().GetTorrentMagnetLink(&t)
	if err != nil {
		return false, err
	}

	// Already in the client: nothing new is downloading, so nothing here may claim otherwise,
	// and the metadata of the download that is already there stays as it is.
	if hash := torrent_client.MagnetInfoHash(magnet); hash != "" && repo.TorrentExists(hash) {
		h.App.Logger.Warn().Str("torrent", t.Name).Msg("torrent client: Torrent is already in the client, skipping")
		return false, nil
	}

	// Save anime metadata BEFORE queueing the download.
	//
	// This record is the ONLY thing linking the download back to its anime — the Unmatched
	// screen has no other way to recover it. If this write fails and the torrent is added
	// anyway, the download lands with nothing attached and has to be matched by hand. That
	// failure used to be logged as a warning and swallowed, which let it go unnoticed across
	// many downloads.
	if media != nil {
		metadata := queuedMetadata
		metadata.AutoMatch = autoMatch
		// Season 1 only is a narrowing of the automatic match, so it travels with it: a torrent
		// singled out to be reviewed by hand carries no scoping rule for a match that will not
		// happen.
		metadata.MatchSeasonOneOnly = autoMatch && matchSeasonOneOnly
		if err := h.App.UnmatchedRepository.SaveTorrentMetadataRecord(t.Name, metadata); err != nil {
			h.App.Logger.Error().Err(err).Str("torrent", t.Name).Msg("torrent client: Failed to save torrent metadata")
			return false, fmt.Errorf("could not save anime metadata for %q, torrent not added: %w", t.Name, err)
		}
	}

	err = repo.AddMagnets([]string{magnet}, destination)
	if errors.Is(err, torrent_client.ErrTorrentAlreadyInClient) {
		return false, nil
	}
	if err != nil {
		return false, err
	}

	// The badge goes up here, at the moment the download exists, and stays up until something
	// says it has moved on. Written after the torrent is accepted so a failed add leaves no
	// badge behind, and written unconditionally so downloading another season of something
	// already in the library says "downloading" again — which is what the card is being asked.
	if media != nil {
		h.App.UnmatchedRepository.MarkAnimeDownloading(media.ID)
	}

	h.App.Logger.Info().Str("torrent", t.Name).Str("destination", destination).Bool("autoMatch", autoMatch && media != nil).Msg("torrent client: Added torrent to unmatched directory")
	return true, nil
}

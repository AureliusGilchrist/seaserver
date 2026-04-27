package anime_test

import (
	"seanime/internal/api/anilist"
	"seanime/internal/api/metadata_provider"
	"seanime/internal/database/db"
	"seanime/internal/extension"
	"seanime/internal/library/anime"
	"seanime/internal/platforms/anilist_platform"
	"seanime/internal/test_utils"
	"seanime/internal/util"
	"testing"

	"github.com/samber/lo"
	"github.com/stretchr/testify/assert"
)

func TestNewLibraryCollection(t *testing.T) {
	test_utils.InitTestProvider(t, test_utils.Anilist())
	logger := util.NewLogger()

	database, err := db.NewDatabase(t.TempDir(), "test", logger)
	assert.NoError(t, err)

	metadataProvider := metadata_provider.GetFakeProvider(t, database)

	anilistClient := anilist.TestGetMockAnilistClient()
	anilistPlatform := anilist_platform.NewAnilistPlatform(util.NewRef(anilistClient), util.NewRef(extension.NewUnifiedBank()), logger, database)

	animeCollection, err := anilistPlatform.GetAnimeCollection(t.Context(), false)

	if assert.NoError(t, err) {

		// Mock Anilist collection and local files
		// User is currently watching Sousou no Frieren and One Piece
		lfs := make([]*anime.LocalFile, 0)

		// Sousou no Frieren
		// 7 episodes downloaded, 4 watched
		mediaId := 154587
		lfs = append(lfs, anime.MockHydratedLocalFiles(
			anime.MockGenerateHydratedLocalFileGroupOptions("E:/Anime", "E:\\Anime\\Sousou no Frieren\\[SubsPlease] Sousou no Frieren - %ep (1080p) [F02B9CEE].mkv", mediaId, []anime.MockHydratedLocalFileWrapperOptionsMetadata{
				{MetadataEpisode: 1, MetadataAniDbEpisode: "1", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 2, MetadataAniDbEpisode: "2", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 3, MetadataAniDbEpisode: "3", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 4, MetadataAniDbEpisode: "4", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 5, MetadataAniDbEpisode: "5", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 6, MetadataAniDbEpisode: "6", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 7, MetadataAniDbEpisode: "7", MetadataType: anime.LocalFileTypeMain},
			}),
		)...)
		anilist.TestModifyAnimeCollectionEntry(animeCollection, mediaId, anilist.TestModifyAnimeCollectionEntryInput{
			Status:   lo.ToPtr(anilist.MediaListStatusCurrent),
			Progress: lo.ToPtr(4), // Mock progress
		})

		// One Piece
		// Downloaded 1070-1075 but only watched up until 1060
		mediaId = 21
		lfs = append(lfs, anime.MockHydratedLocalFiles(
			anime.MockGenerateHydratedLocalFileGroupOptions("E:/Anime", "E:\\Anime\\One Piece\\[SubsPlease] One Piece - %ep (1080p) [F02B9CEE].mkv", mediaId, []anime.MockHydratedLocalFileWrapperOptionsMetadata{
				{MetadataEpisode: 1070, MetadataAniDbEpisode: "1070", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 1071, MetadataAniDbEpisode: "1071", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 1072, MetadataAniDbEpisode: "1072", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 1073, MetadataAniDbEpisode: "1073", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 1074, MetadataAniDbEpisode: "1074", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 1075, MetadataAniDbEpisode: "1075", MetadataType: anime.LocalFileTypeMain},
			}),
		)...)
		anilist.TestModifyAnimeCollectionEntry(animeCollection, mediaId, anilist.TestModifyAnimeCollectionEntryInput{
			Status:   lo.ToPtr(anilist.MediaListStatusCurrent),
			Progress: lo.ToPtr(1060), // Mock progress
		})

		// Add unmatched local files
		mediaId = 0
		lfs = append(lfs, anime.MockHydratedLocalFiles(
			anime.MockGenerateHydratedLocalFileGroupOptions("E:/Anime", "E:\\Anime\\Unmatched\\[SubsPlease] Unmatched - %ep (1080p) [F02B9CEE].mkv", mediaId, []anime.MockHydratedLocalFileWrapperOptionsMetadata{
				{MetadataEpisode: 1, MetadataAniDbEpisode: "1", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 2, MetadataAniDbEpisode: "2", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 3, MetadataAniDbEpisode: "3", MetadataType: anime.LocalFileTypeMain},
				{MetadataEpisode: 4, MetadataAniDbEpisode: "4", MetadataType: anime.LocalFileTypeMain},
			}),
		)...)

		libraryCollection, err := anime.NewLibraryCollection(t.Context(), &anime.NewLibraryCollectionOptions{
			AnimeCollection:     animeCollection,
			LocalFiles:          lfs,
			PlatformRef:         util.NewRef(anilistPlatform),
			MetadataProviderRef: util.NewRef(metadataProvider),
		})

		if assert.NoError(t, err) {

			assert.Equal(t, 1, len(libraryCollection.ContinueWatchingList)) // Only Sousou no Frieren is in the continue watching list
			assert.Equal(t, 4, len(libraryCollection.UnmatchedLocalFiles))  // 4 unmatched local files

		}
	}
}

func TestHydrateUnknownGroups(t *testing.T) {
	test_utils.InitTestProvider(t, test_utils.Anilist())
	logger := util.NewLogger()

	database, err := db.NewDatabase(t.TempDir(), "test", logger)
	assert.NoError(t, err)

	metadataProvider := metadata_provider.GetFakeProvider(t, database)

	anilistClient := anilist.TestGetMockAnilistClient()
	anilistPlatform := anilist_platform.NewAnilistPlatform(util.NewRef(anilistClient), util.NewRef(extension.NewUnifiedBank()), logger, database)

	animeCollection, err := anilistPlatform.GetAnimeCollection(t.Context(), false)
	assert.NoError(t, err)

	// Create local files with media IDs that are NOT in the collection
	// These should appear in UnknownGroups
	unknownMediaId := 99999 // This media ID is not in the test collection
	lfs := anime.MockHydratedLocalFiles(
		anime.MockGenerateHydratedLocalFileGroupOptions("E:/Anime", "E:\\Anime\\Unknown\\[Test] Unknown Anime - 01 (1080p).mkv", unknownMediaId, []anime.MockHydratedLocalFileWrapperOptionsMetadata{
			{MetadataEpisode: 1, MetadataAniDbEpisode: "1", MetadataType: anime.LocalFileTypeMain},
		}),
		anime.MockGenerateHydratedLocalFileGroupOptions("E:/Anime", "E:\\Anime\\Unknown\\[Test] Unknown Anime - 02 (1080p).mkv", unknownMediaId, []anime.MockHydratedLocalFileWrapperOptionsMetadata{
			{MetadataEpisode: 2, MetadataAniDbEpisode: "2", MetadataType: anime.LocalFileTypeMain},
		}),
	)

	// Also add some files with media IDs that ARE in the collection (should not appear in UnknownGroups)
	mediaId := 154587 // Sousou no Frieren from the existing test
	lfs = append(lfs, anime.MockHydratedLocalFiles(
		anime.MockGenerateHydratedLocalFileGroupOptions("E:/Anime", "E:\\Anime\\Sousou no Frieren\\[SubsPlease] Sousou no Frieren - 01 (1080p).mkv", mediaId, []anime.MockHydratedLocalFileWrapperOptionsMetadata{
			{MetadataEpisode: 1, MetadataAniDbEpisode: "1", MetadataType: anime.LocalFileTypeMain},
		}),
	)...)

	libraryCollection, err := anime.NewLibraryCollection(t.Context(), &anime.NewLibraryCollectionOptions{
		AnimeCollection:     animeCollection,
		LocalFiles:          lfs,
		PlatformRef:         util.NewRef(anilistPlatform),
		MetadataProviderRef: util.NewRef(metadataProvider),
	})

	if assert.NoError(t, err) {
		// Should have exactly one UnknownGroup for the unknown media
		assert.Equal(t, 1, len(libraryCollection.UnknownGroups))
		
		unknownGroup := libraryCollection.UnknownGroups[0]
		assert.Equal(t, unknownMediaId, unknownGroup.MediaId)
		assert.Equal(t, 2, len(unknownGroup.LocalFiles)) // Two files for the unknown media
		
		// Verify the files are the correct ones
		for _, lf := range unknownGroup.LocalFiles {
			assert.Equal(t, unknownMediaId, lf.MediaId)
		}
	}
}

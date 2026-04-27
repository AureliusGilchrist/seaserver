package continuity

import (
	"fmt"
	"seanime/internal/database/db_bridge"
	"seanime/internal/hook"
	"seanime/internal/library/anime"
	"seanime/internal/util"
	"seanime/internal/util/filecache"
	"strconv"
	"strings"
	"time"
)

const (
	MaxWatchHistoryItems            = 100
	IgnoreRatioThreshold            = 0.9
	MinSaveTimeSeconds              = 30
	WatchHistoryBucketName          = "watch_history"
	EpisodeWatchPositionBucketName  = "episode_watch_positions"
)

// GetProfileBucket returns a file cache bucket namespaced by profile ID.
// If profileID is 0, returns the default (global) bucket.
func GetProfileBucket(profileID uint) filecache.Bucket {
	if profileID == 0 {
		return filecache.NewBucket(WatchHistoryBucketName, time.Hour*24*180)
	}
	return filecache.NewBucket(fmt.Sprintf("%s_%d", WatchHistoryBucketName, profileID), time.Hour*24*180)
}

// GetEpisodeProfileBucket returns a file cache bucket for per-episode watch positions, namespaced by profile ID.
func GetEpisodeProfileBucket(profileID uint) filecache.Bucket {
	if profileID == 0 {
		return filecache.NewBucket(EpisodeWatchPositionBucketName, time.Hour*24*180)
	}
	return filecache.NewBucket(fmt.Sprintf("%s_%d", EpisodeWatchPositionBucketName, profileID), time.Hour*24*180)
}

type (
	// WatchHistory is a map of WatchHistoryItem.
	// The key is the WatchHistoryItem.MediaId.
	WatchHistory map[int]*WatchHistoryItem

	// WatchHistoryItem are stored in the file cache.
	// The history is used to resume playback from the last known position.
	// Item.MediaId and Item.EpisodeNumber are used to identify the media and episode.
	// Only one Item per MediaId should exist in the history.
	WatchHistoryItem struct {
		Kind Kind `json:"kind"`
		// Used for MediastreamKind and ExternalPlayerKind.
		Filepath      string `json:"filepath"`
		MediaId       int    `json:"mediaId"`
		EpisodeNumber int    `json:"episodeNumber"`
		// The current playback time in seconds.
		// Used to determine when to remove the item from the history.
		CurrentTime float64 `json:"currentTime"`
		// The duration of the media in seconds.
		Duration float64 `json:"duration"`
		// Timestamp of when the item was added to the history.
		TimeAdded time.Time `json:"timeAdded"`
		// TimeAdded is used in conjunction with TimeUpdated
		// Timestamp of when the item was last updated.
		// Used to determine when to remove the item from the history (First in, first out).
		TimeUpdated time.Time `json:"timeUpdated"`
	}

	WatchHistoryItemResponse struct {
		Item  *WatchHistoryItem `json:"item"`
		Found bool              `json:"found"`
	}

	UpdateWatchHistoryItemOptions struct {
		CurrentTime   float64 `json:"currentTime"`
		Duration      float64 `json:"duration"`
		MediaId       int     `json:"mediaId"`
		EpisodeNumber int     `json:"episodeNumber"`
		Filepath      string  `json:"filepath,omitempty"`
		Kind          Kind    `json:"kind"`
	}

	// EpisodeWatchPosition stores the playback position for a specific episode.
	// Stored separately from WatchHistoryItem so per-episode resume survives episode changes.
	EpisodeWatchPosition struct {
		CurrentTime float64   `json:"currentTime"`
		Duration    float64   `json:"duration"`
		TimeUpdated time.Time `json:"timeUpdated"`
	}

	EpisodeWatchPositionResponse struct {
		Item  *EpisodeWatchPosition `json:"item"`
		Found bool                  `json:"found"`
	}
)

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

func (m *Manager) GetWatchHistory() WatchHistory {
	defer util.HandlePanicInModuleThen("continuity/GetWatchHistory", func() {})

	m.mu.RLock()
	defer m.mu.RUnlock()

	items, err := filecache.GetAll[*WatchHistoryItem](m.fileCacher, *m.watchHistoryFileCacheBucket)
	if err != nil {
		m.logger.Error().Err(err).Msg("continuity: Failed to get watch history")
		return nil
	}

	ret := make(WatchHistory)
	for _, item := range items {
		ret[item.MediaId] = item
	}

	return ret
}

func (m *Manager) GetWatchHistoryItem(mediaId int) *WatchHistoryItemResponse {
	defer util.HandlePanicInModuleThen("continuity/GetWatchHistoryItem", func() {})

	m.mu.RLock()
	defer m.mu.RUnlock()

	i, found := m.getWatchHistory(mediaId)
	return &WatchHistoryItemResponse{
		Item:  i,
		Found: found,
	}
}

// GetEpisodeWatchPosition returns the saved playback position for a specific episode.
func (m *Manager) GetEpisodeWatchPosition(mediaId, episodeNumber int) *EpisodeWatchPositionResponse {
	defer util.HandlePanicInModuleThen("continuity/GetEpisodeWatchPosition", func() {})

	m.mu.RLock()
	defer m.mu.RUnlock()

	return m.getEpisodeWatchPosition(*m.episodeWatchPositionFileCacheBucket, mediaId, episodeNumber)
}

// GetEpisodeWatchPositionForProfile returns the saved playback position for a specific episode, scoped to a profile.
func (m *Manager) GetEpisodeWatchPositionForProfile(profileID uint, mediaId, episodeNumber int) *EpisodeWatchPositionResponse {
	defer util.HandlePanicInModuleThen("continuity/GetEpisodeWatchPositionForProfile", func() {})

	m.mu.RLock()
	defer m.mu.RUnlock()

	bucket := GetEpisodeProfileBucket(profileID)
	return m.getEpisodeWatchPosition(bucket, mediaId, episodeNumber)
}

func (m *Manager) getEpisodeWatchPosition(bucket filecache.Bucket, mediaId, episodeNumber int) *EpisodeWatchPositionResponse {
	key := fmt.Sprintf("%d_%d", mediaId, episodeNumber)

	var pos *EpisodeWatchPosition
	exists, _ := m.fileCacher.Get(bucket, key, &pos)

	if exists && pos != nil && pos.Duration > 0 {
		ratio := pos.CurrentTime / pos.Duration
		if ratio >= IgnoreRatioThreshold {
			go func() {
				defer util.HandlePanicInModuleThen("continuity/getEpisodeWatchPosition", func() {})
				_ = m.fileCacher.Delete(bucket, key)
			}()
			return &EpisodeWatchPositionResponse{Item: nil, Found: false}
		}
		if pos.CurrentTime < MinSaveTimeSeconds {
			return &EpisodeWatchPositionResponse{Item: nil, Found: false}
		}
	}

	if !exists || pos == nil {
		return &EpisodeWatchPositionResponse{Item: nil, Found: false}
	}

	return &EpisodeWatchPositionResponse{Item: pos, Found: true}
}

// UpdateWatchHistoryItem updates the WatchHistoryItem in the file cache.
func (m *Manager) UpdateWatchHistoryItem(opts *UpdateWatchHistoryItemOptions) (err error) {
	defer util.HandlePanicInModuleWithError("continuity/UpdateWatchHistoryItem", &err)

	m.mu.Lock()
	defer m.mu.Unlock()

	// Don't save if less than 30 seconds watched
	if opts.CurrentTime < MinSaveTimeSeconds {
		return nil
	}

	added := false

	// Get the current history
	i, found := m.getWatchHistory(opts.MediaId)
	if !found {
		added = true
		i = &WatchHistoryItem{
			Kind:          opts.Kind,
			Filepath:      opts.Filepath,
			MediaId:       opts.MediaId,
			EpisodeNumber: opts.EpisodeNumber,
			CurrentTime:   opts.CurrentTime,
			Duration:      opts.Duration,
			TimeAdded:     time.Now(),
			TimeUpdated:   time.Now(),
		}
	} else {
		i.Kind = opts.Kind
		i.EpisodeNumber = opts.EpisodeNumber
		i.CurrentTime = opts.CurrentTime
		i.Duration = opts.Duration
		i.TimeUpdated = time.Now()
	}

	// Save the series-level entry
	err = m.fileCacher.Set(*m.watchHistoryFileCacheBucket, strconv.Itoa(opts.MediaId), i)
	if err != nil {
		return fmt.Errorf("continuity: Failed to save watch history item: %w", err)
	}

	// Also save per-episode position
	m.saveEpisodeWatchPosition(*m.episodeWatchPositionFileCacheBucket, opts)

	_ = hook.GlobalHookManager.OnWatchHistoryItemUpdated().Trigger(&WatchHistoryItemUpdatedEvent{
		WatchHistoryItem: i,
	})

	// If the item was added, check if we need to remove the oldest item
	if added {
		_ = m.trimWatchHistoryItems()
	}

	return nil
}

func (m *Manager) DeleteWatchHistoryItem(mediaId int) (err error) {
	defer util.HandlePanicInModuleWithError("continuity/DeleteWatchHistoryItem", &err)

	m.mu.Lock()
	defer m.mu.Unlock()

	err = m.fileCacher.Delete(*m.watchHistoryFileCacheBucket, strconv.Itoa(mediaId))
	if err != nil {
		return fmt.Errorf("continuity: Failed to delete watch history item: %w", err)
	}

	return nil
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// GetExternalPlayerEpisodeWatchHistoryItem is called before launching the external player to get the last known position.
// Unlike GetWatchHistoryItem, this checks if the episode numbers match.
func (m *Manager) GetExternalPlayerEpisodeWatchHistoryItem(path string, isStream bool, episode, mediaId int) (ret *WatchHistoryItemResponse) {
	defer util.HandlePanicInModuleThen("continuity/GetExternalPlayerEpisodeWatchHistoryItem", func() {})

	m.mu.RLock()
	defer m.mu.RUnlock()

	if !m.settings.WatchContinuityEnabled {
		return &WatchHistoryItemResponse{
			Item:  nil,
			Found: false,
		}
	}

	ret = &WatchHistoryItemResponse{
		Item:  nil,
		Found: false,
	}

	m.logger.Debug().
		Str("path", path).
		Bool("isStream", isStream).
		Int("episode", episode).
		Int("mediaId", mediaId).
		Msg("continuity: Retrieving watch history item")

	// Normalize path
	path = util.NormalizePath(path)

	if isStream {

		event := &WatchHistoryStreamEpisodeItemRequestedEvent{
			WatchHistoryItem: &WatchHistoryItem{},
		}

		hook.GlobalHookManager.OnWatchHistoryStreamEpisodeItemRequested().Trigger(event)
		if event.DefaultPrevented {
			return &WatchHistoryItemResponse{
				Item:  event.WatchHistoryItem,
				Found: event.WatchHistoryItem != nil,
			}
		}

		if episode == 0 || mediaId == 0 {
			m.logger.Debug().
				Int("episode", episode).
				Int("mediaId", mediaId).
				Msg("continuity: No episode or media provided")
			return
		}

		i, found := m.getWatchHistory(mediaId)
		if !found || i.EpisodeNumber != episode {
			m.logger.Trace().
				Interface("item", i).
				Msg("continuity: No watch history item found or episode number does not match")
			return
		}

		m.logger.Debug().
			Interface("item", i).
			Msg("continuity: Watch history item found")

		return &WatchHistoryItemResponse{
			Item:  i,
			Found: found,
		}

	} else {
		// Find the local file from the path
		lfs, _, err := db_bridge.GetLocalFiles(m.db)
		if err != nil {
			return ret
		}

		event := &WatchHistoryLocalFileEpisodeItemRequestedEvent{
			Path:             path,
			LocalFiles:       lfs,
			WatchHistoryItem: &WatchHistoryItem{},
		}
		hook.GlobalHookManager.OnWatchHistoryLocalFileEpisodeItemRequested().Trigger(event)
		if event.DefaultPrevented {
			return &WatchHistoryItemResponse{
				Item:  event.WatchHistoryItem,
				Found: event.WatchHistoryItem != nil,
			}
		}

		var lf *anime.LocalFile
		// Find the local file from the path
		for _, l := range lfs {
			if l.GetNormalizedPath() == path {
				lf = l
				m.logger.Trace().Msg("continuity: Local file found from path")
				break
			}
		}
		// If the local file is not found, the path might be a filename (in the case of VLC)
		if lf == nil {
			for _, l := range lfs {
				if strings.ToLower(l.Name) == path {
					lf = l
					m.logger.Trace().Msg("continuity: Local file found from filename")
					break
				}
			}
		}

		if lf == nil || lf.MediaId == 0 || !lf.IsMain() {
			m.logger.Trace().Msg("continuity: Local file not found or not main")
			return
		}

		i, found := m.getWatchHistory(lf.MediaId)
		if !found || i.EpisodeNumber != lf.GetEpisodeNumber() {
			m.logger.Trace().
				Interface("item", i).
				Msg("continuity: No watch history item found or episode number does not match")
			return
		}

		m.logger.Debug().
			Interface("item", i).
			Msg("continuity: Watch history item found")

		return &WatchHistoryItemResponse{
			Item:  i,
			Found: found,
		}
	}
}

func (m *Manager) UpdateExternalPlayerEpisodeWatchHistoryItem(currentTime, duration float64) {
	defer util.HandlePanicInModuleThen("continuity/UpdateWatchHistoryItem", func() {})

	m.mu.Lock()
	defer m.mu.Unlock()

	if !m.settings.WatchContinuityEnabled {
		return
	}

	// Don't save if less than 30 seconds watched
	if currentTime < MinSaveTimeSeconds {
		return
	}

	if m.externalPlayerEpisodeDetails.IsAbsent() {
		return
	}

	added := false

	opts, ok := m.externalPlayerEpisodeDetails.Get()
	if !ok {
		return
	}

	// Get the current history
	i, found := m.getWatchHistory(opts.MediaId)
	if !found {
		added = true
		i = &WatchHistoryItem{
			Kind:          ExternalPlayerKind,
			Filepath:      opts.Filepath,
			MediaId:       opts.MediaId,
			EpisodeNumber: opts.EpisodeNumber,
			CurrentTime:   currentTime,
			Duration:      duration,
			TimeAdded:     time.Now(),
			TimeUpdated:   time.Now(),
		}
	} else {
		i.Kind = ExternalPlayerKind
		i.EpisodeNumber = opts.EpisodeNumber
		i.CurrentTime = currentTime
		i.Duration = duration
		i.TimeUpdated = time.Now()
	}

	// Save the i
	_ = m.fileCacher.Set(*m.watchHistoryFileCacheBucket, strconv.Itoa(opts.MediaId), i)

	// Also save per-episode position
	m.saveEpisodeWatchPosition(*m.episodeWatchPositionFileCacheBucket, &UpdateWatchHistoryItemOptions{
		CurrentTime:   currentTime,
		Duration:      duration,
		MediaId:       opts.MediaId,
		EpisodeNumber: opts.EpisodeNumber,
	})

	// If the item was added, check if we need to remove the oldest item
	if added {
		_ = m.trimWatchHistoryItems()
	}

	return
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// saveEpisodeWatchPosition saves the playback position for a specific episode to the given bucket.
func (m *Manager) saveEpisodeWatchPosition(bucket filecache.Bucket, opts *UpdateWatchHistoryItemOptions) {
	key := fmt.Sprintf("%d_%d", opts.MediaId, opts.EpisodeNumber)
	pos := &EpisodeWatchPosition{
		CurrentTime: opts.CurrentTime,
		Duration:    opts.Duration,
		TimeUpdated: time.Now(),
	}
	_ = m.fileCacher.Set(bucket, key, pos)
}

func (m *Manager) getWatchHistory(mediaId int) (ret *WatchHistoryItem, exists bool) {
	defer util.HandlePanicInModuleThen("continuity/getWatchHistory", func() {
		ret = nil
		exists = false
	})

	reqEvent := &WatchHistoryItemRequestedEvent{
		MediaId:          mediaId,
		WatchHistoryItem: ret,
	}
	hook.GlobalHookManager.OnWatchHistoryItemRequested().Trigger(reqEvent)
	ret = reqEvent.WatchHistoryItem

	if reqEvent.DefaultPrevented {
		return reqEvent.WatchHistoryItem, reqEvent.WatchHistoryItem != nil
	}

	exists, _ = m.fileCacher.Get(*m.watchHistoryFileCacheBucket, strconv.Itoa(mediaId), &ret)

	if exists && ret != nil && ret.Duration > 0 {
		// If the item completion ratio is equal or above IgnoreRatioThreshold, don't return anything
		ratio := ret.CurrentTime / ret.Duration
		if ratio >= IgnoreRatioThreshold {
			// Delete the item
			go func() {
				defer util.HandlePanicInModuleThen("continuity/getWatchHistory", func() {})
				_ = m.fileCacher.Delete(*m.watchHistoryFileCacheBucket, strconv.Itoa(mediaId))
			}()
			return nil, false
		}
		if ratio < 0.05 {
			return nil, false
		}
	}

	return
}

// removes the oldest WatchHistoryItem from the file cache.
func (m *Manager) trimWatchHistoryItems() error {
	defer util.HandlePanicInModuleThen("continuity/TrimWatchHistoryItems", func() {})

	// Get all the items
	items, err := filecache.GetAll[*WatchHistoryItem](m.fileCacher, *m.watchHistoryFileCacheBucket)
	if err != nil {
		return fmt.Errorf("continuity: Failed to get watch history items: %w", err)
	}

	// If there are too many items, remove the oldest one
	if len(items) > MaxWatchHistoryItems {
		var oldestKey string
		for key := range items {
			if oldestKey == "" || items[key].TimeUpdated.Before(items[oldestKey].TimeUpdated) {
				oldestKey = key
			}
		}
		err = m.fileCacher.Delete(*m.watchHistoryFileCacheBucket, oldestKey)
		if err != nil {
			return fmt.Errorf("continuity: Failed to remove oldest watch history item: %w", err)
		}
	}

	return nil
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// Profile-scoped watch history methods.
// These use a separate file cache bucket per profile (watch_history_{profileID}).

func (m *Manager) GetWatchHistoryForProfile(profileID uint) WatchHistory {
	defer util.HandlePanicInModuleThen("continuity/GetWatchHistoryForProfile", func() {})

	m.mu.RLock()
	defer m.mu.RUnlock()

	bucket := GetProfileBucket(profileID)
	items, err := filecache.GetAll[*WatchHistoryItem](m.fileCacher, bucket)
	if err != nil {
		m.logger.Error().Err(err).Uint("profileID", profileID).Msg("continuity: Failed to get profile watch history")
		return nil
	}

	ret := make(WatchHistory)
	for _, item := range items {
		ret[item.MediaId] = item
	}
	return ret
}

func (m *Manager) GetWatchHistoryItemForProfile(profileID uint, mediaId int) *WatchHistoryItemResponse {
	defer util.HandlePanicInModuleThen("continuity/GetWatchHistoryItemForProfile", func() {})

	m.mu.RLock()
	defer m.mu.RUnlock()

	bucket := GetProfileBucket(profileID)
	var ret *WatchHistoryItem
	exists, _ := m.fileCacher.Get(bucket, strconv.Itoa(mediaId), &ret)

	if exists && ret != nil && ret.Duration > 0 {
		ratio := ret.CurrentTime / ret.Duration
		if ratio >= IgnoreRatioThreshold {
			go func() {
				defer util.HandlePanicInModuleThen("continuity/GetWatchHistoryItemForProfile", func() {})
				_ = m.fileCacher.Delete(bucket, strconv.Itoa(mediaId))
			}()
			return &WatchHistoryItemResponse{Item: nil, Found: false}
		}
		if ratio < 0.05 {
			return &WatchHistoryItemResponse{Item: nil, Found: false}
		}
	}

	return &WatchHistoryItemResponse{Item: ret, Found: exists}
}

func (m *Manager) UpdateWatchHistoryItemForProfile(profileID uint, opts *UpdateWatchHistoryItemOptions) error {
	defer util.HandlePanicInModuleThen("continuity/UpdateWatchHistoryItemForProfile", func() {})

	m.mu.Lock()
	defer m.mu.Unlock()

	// Don't save if less than 30 seconds watched
	if opts.CurrentTime < MinSaveTimeSeconds {
		return nil
	}

	bucket := GetProfileBucket(profileID)
	added := false

	var i *WatchHistoryItem
	exists, _ := m.fileCacher.Get(bucket, strconv.Itoa(opts.MediaId), &i)

	if !exists || i == nil {
		added = true
		i = &WatchHistoryItem{
			Kind:          opts.Kind,
			Filepath:      opts.Filepath,
			MediaId:       opts.MediaId,
			EpisodeNumber: opts.EpisodeNumber,
			CurrentTime:   opts.CurrentTime,
			Duration:      opts.Duration,
			TimeAdded:     time.Now(),
			TimeUpdated:   time.Now(),
		}
	} else {
		i.Kind = opts.Kind
		i.EpisodeNumber = opts.EpisodeNumber
		i.CurrentTime = opts.CurrentTime
		i.Duration = opts.Duration
		i.TimeUpdated = time.Now()
	}

	err := m.fileCacher.Set(bucket, strconv.Itoa(opts.MediaId), i)
	if err != nil {
		return fmt.Errorf("continuity: Failed to save profile watch history item: %w", err)
	}

	// Also update the global bucket so internal playback manager still works
	_ = m.fileCacher.Set(*m.watchHistoryFileCacheBucket, strconv.Itoa(opts.MediaId), i)

	// Also save per-episode position
	epBucket := GetEpisodeProfileBucket(profileID)
	m.saveEpisodeWatchPosition(epBucket, opts)

	_ = hook.GlobalHookManager.OnWatchHistoryItemUpdated().Trigger(&WatchHistoryItemUpdatedEvent{
		WatchHistoryItem: i,
	})

	if added {
		_ = m.trimProfileWatchHistory(bucket)
	}

	return nil
}

func (m *Manager) DeleteWatchHistoryItemForProfile(profileID uint, mediaId int) error {
	defer util.HandlePanicInModuleThen("continuity/DeleteWatchHistoryItemForProfile", func() {})

	m.mu.Lock()
	defer m.mu.Unlock()

	bucket := GetProfileBucket(profileID)
	return m.fileCacher.Delete(bucket, strconv.Itoa(mediaId))
}

func (m *Manager) trimProfileWatchHistory(bucket filecache.Bucket) error {
	items, err := filecache.GetAll[*WatchHistoryItem](m.fileCacher, bucket)
	if err != nil {
		return err
	}
	if len(items) > MaxWatchHistoryItems {
		var oldestKey string
		for key := range items {
			if oldestKey == "" || items[key].TimeUpdated.Before(items[oldestKey].TimeUpdated) {
				oldestKey = key
			}
		}
		return m.fileCacher.Delete(bucket, oldestKey)
	}
	return nil
}

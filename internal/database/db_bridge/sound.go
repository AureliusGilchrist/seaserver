package db_bridge

import (
	"seanime/internal/database/db"
	"seanime/internal/database/models"
	"strings"
)

// --- SoundTrack ---

func ListSoundTracks(database *db.Database) ([]*models.SoundTrack, error) {
	var res []*models.SoundTrack
	err := database.Gorm().Order("created_at DESC").Find(&res).Error
	if err != nil {
		return nil, err
	}
	if res == nil {
		res = []*models.SoundTrack{}
	}
	return res, nil
}

func GetSoundTrackByUUID(database *db.Database, uuid string) (*models.SoundTrack, error) {
	var t models.SoundTrack
	if err := database.Gorm().Where("uuid = ?", uuid).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func GetSoundTrackByIAIdentifier(database *db.Database, iaIdentifier, iaFilename string) (*models.SoundTrack, error) {
	var t models.SoundTrack
	if err := database.Gorm().Where("ia_identifier = ? AND ia_filename = ?", iaIdentifier, iaFilename).First(&t).Error; err != nil {
		return nil, err
	}
	return &t, nil
}

func CreateSoundTrack(database *db.Database, track *models.SoundTrack) error {
	return database.Gorm().Create(track).Error
}

func DeleteSoundTrackByUUID(database *db.Database, uuid string) error {
	return database.Gorm().Where("uuid = ?", uuid).Delete(&models.SoundTrack{}).Error
}

// --- SoundPlaylist ---

func ListSoundPlaylists(database *db.Database) ([]*models.SoundPlaylist, error) {
	var res []*models.SoundPlaylist
	err := database.Gorm().Order("created_at ASC").Find(&res).Error
	if err != nil {
		return nil, err
	}
	if res == nil {
		res = []*models.SoundPlaylist{}
	}
	return res, nil
}

func GetSoundPlaylist(database *db.Database, id uint) (*models.SoundPlaylist, error) {
	var p models.SoundPlaylist
	if err := database.Gorm().Where("id = ?", id).First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func CreateSoundPlaylist(database *db.Database, name string, trackUUIDs []string) (*models.SoundPlaylist, error) {
	p := &models.SoundPlaylist{
		Name:          name,
		TrackUUIDsCSV: strings.Join(trackUUIDs, ","),
	}
	if err := database.Gorm().Create(p).Error; err != nil {
		return nil, err
	}
	return p, nil
}

func UpdateSoundPlaylist(database *db.Database, id uint, name string, trackUUIDs []string) (*models.SoundPlaylist, error) {
	p, err := GetSoundPlaylist(database, id)
	if err != nil {
		return nil, err
	}
	p.Name = name
	p.TrackUUIDsCSV = strings.Join(trackUUIDs, ",")
	if err := database.Gorm().Save(p).Error; err != nil {
		return nil, err
	}
	return p, nil
}

func DeleteSoundPlaylist(database *db.Database, id uint) error {
	return database.Gorm().Where("id = ?", id).Delete(&models.SoundPlaylist{}).Error
}

// SplitTrackUUIDs decodes the CSV column. Empty string returns an empty slice.
func SplitTrackUUIDs(csv string) []string {
	csv = strings.TrimSpace(csv)
	if csv == "" {
		return []string{}
	}
	parts := strings.Split(csv, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

package db

import (
	"seanime/internal/database/models"
)

func (db *Database) GetBuiltinTorrentItems() ([]*models.BuiltinTorrentItem, error) {
	var res []*models.BuiltinTorrentItem
	err := db.gormdb.Find(&res).Error
	return res, err
}

func (db *Database) GetBuiltinTorrentItemByHash(hash string) (*models.BuiltinTorrentItem, error) {
	var res models.BuiltinTorrentItem
	err := db.gormdb.Where("hash = ?", hash).First(&res).Error
	if err != nil {
		return nil, err
	}
	return &res, nil
}

func (db *Database) UpsertBuiltinTorrentItem(item *models.BuiltinTorrentItem) error {
	var existing models.BuiltinTorrentItem
	err := db.gormdb.Where("hash = ?", item.Hash).First(&existing).Error
	if err != nil {
		return db.gormdb.Create(item).Error
	}
	return db.gormdb.Model(&existing).Updates(map[string]interface{}{
		"magnet":       item.Magnet,
		"name":         item.Name,
		"download_dir": item.DownloadDir,
		"status":       item.Status,
	}).Error
}

func (db *Database) DeleteBuiltinTorrentItemByHash(hash string) error {
	return db.gormdb.Where("hash = ?", hash).Delete(&models.BuiltinTorrentItem{}).Error
}

func (db *Database) UpdateBuiltinTorrentStatus(hash, status string) error {
	return db.gormdb.Model(&models.BuiltinTorrentItem{}).Where("hash = ?", hash).Update("status", status).Error
}

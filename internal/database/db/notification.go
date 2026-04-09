package db

import (
	"seanime/internal/database/models"
	"time"
)

// GetNotifications returns paginated notifications ordered by created_at desc.
// Also returns the total count for pagination.
func (db *Database) GetNotifications(page, limit int) ([]models.Notification, int64, error) {
	var total int64
	if err := db.gormdb.Model(&models.Notification{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var notifications []models.Notification
	offset := (page - 1) * limit
	if err := db.gormdb.Order("created_at desc").Offset(offset).Limit(limit).Find(&notifications).Error; err != nil {
		return nil, 0, err
	}

	return notifications, total, nil
}

// GetUnreadNotificationCount returns the number of unread notifications.
func (db *Database) GetUnreadNotificationCount() (int64, error) {
	var count int64
	if err := db.gormdb.Model(&models.Notification{}).Where("is_read = ?", false).Count(&count).Error; err != nil {
		return 0, err
	}
	return count, nil
}

// CreateNotification inserts a new notification record.
func (db *Database) CreateNotification(n *models.Notification) error {
	return db.gormdb.Create(n).Error
}

// MarkNotificationRead marks a single notification as read.
func (db *Database) MarkNotificationRead(id uint) error {
	return db.gormdb.Model(&models.Notification{}).Where("id = ?", id).Update("is_read", true).Error
}

// MarkAllNotificationsRead marks all notifications as read.
func (db *Database) MarkAllNotificationsRead() error {
	return db.gormdb.Model(&models.Notification{}).Where("is_read = ?", false).Update("is_read", true).Error
}

// DeleteNotification removes a single notification by ID.
func (db *Database) DeleteNotification(id uint) error {
	return db.gormdb.Where("id = ?", id).Delete(&models.Notification{}).Error
}

// DeleteOldNotifications removes notifications older than the given time.
// Returns the number of deleted records.
func (db *Database) DeleteOldNotifications(olderThan time.Time) (int64, error) {
	result := db.gormdb.Where("created_at < ?", olderThan).Delete(&models.Notification{})
	return result.RowsAffected, result.Error
}

package db

import (
	"seanime/internal/database/models"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// GetCommentsByMedia returns all comments for a given media, ordered as specified.
// sortBy: "top" (by vote score), "newest", "oldest"
func (db *Database) GetCommentsByMedia(mediaID int, mediaType string, sortBy string) ([]*models.Comment, error) {
	var comments []*models.Comment
	q := db.gormdb.Where("media_id = ? AND media_type = ?", mediaID, mediaType)

	switch sortBy {
	case "oldest":
		q = q.Order("created_at ASC")
	case "newest":
		q = q.Order("created_at DESC")
	default: // "top" — sorted later after computing scores
		q = q.Order("created_at DESC")
	}

	if err := q.Find(&comments).Error; err != nil {
		return nil, err
	}

	return comments, nil
}

// CreateComment inserts a new comment.
func (db *Database) CreateComment(comment *models.Comment) error {
	return db.gormdb.Create(comment).Error
}

// GetComment retrieves a single comment by ID.
func (db *Database) GetComment(id uint) (*models.Comment, error) {
	var comment models.Comment
	if err := db.gormdb.First(&comment, id).Error; err != nil {
		return nil, err
	}
	return &comment, nil
}

// UpdateCommentContent updates a comment's content and marks it as edited.
func (db *Database) UpdateCommentContent(id uint, content string) error {
	return db.gormdb.Model(&models.Comment{}).Where("id = ?", id).Updates(map[string]interface{}{
		"content":   content,
		"is_edited": true,
	}).Error
}

// DeleteComment deletes a comment and its children and all associated votes.
func (db *Database) DeleteComment(id uint) error {
	return db.gormdb.Transaction(func(tx *gorm.DB) error {
		// Get all descendant comment IDs recursively
		ids := []uint{id}
		queue := []uint{id}
		for len(queue) > 0 {
			var childIDs []uint
			if err := tx.Model(&models.Comment{}).Where("parent_id IN ?", queue).Pluck("id", &childIDs).Error; err != nil {
				return err
			}
			ids = append(ids, childIDs...)
			queue = childIDs
		}

		// Delete votes for all comments in the tree
		if err := tx.Where("comment_id IN ?", ids).Delete(&models.CommentVote{}).Error; err != nil {
			return err
		}

		// Delete all comments in the tree
		if err := tx.Where("id IN ?", ids).Delete(&models.Comment{}).Error; err != nil {
			return err
		}

		return nil
	})
}

// UpsertCommentVote creates or updates a vote. Value 0 removes the vote.
func (db *Database) UpsertCommentVote(commentID uint, profileID uint, value int) error {
	if value == 0 {
		return db.gormdb.Where("comment_id = ? AND profile_id = ?", commentID, profileID).Delete(&models.CommentVote{}).Error
	}

	vote := models.CommentVote{
		CommentID: commentID,
		ProfileID: profileID,
		Value:     value,
	}
	return db.gormdb.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "comment_id"}, {Name: "profile_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"value"}),
	}).Create(&vote).Error
}

// GetCommentVotes returns all votes for a set of comment IDs.
func (db *Database) GetCommentVotes(commentIDs []uint) ([]*models.CommentVote, error) {
	if len(commentIDs) == 0 {
		return nil, nil
	}
	var votes []*models.CommentVote
	if err := db.gormdb.Where("comment_id IN ?", commentIDs).Find(&votes).Error; err != nil {
		return nil, err
	}
	return votes, nil
}

// GetCommentVotesByProfile returns the current user's votes for a set of comment IDs.
func (db *Database) GetCommentVotesByProfile(commentIDs []uint, profileID uint) ([]*models.CommentVote, error) {
	if len(commentIDs) == 0 {
		return nil, nil
	}
	var votes []*models.CommentVote
	if err := db.gormdb.Where("comment_id IN ? AND profile_id = ?", commentIDs, profileID).Find(&votes).Error; err != nil {
		return nil, err
	}
	return votes, nil
}

// GetCommentCountByMedia returns the total count of comments for a media.
func (db *Database) GetCommentCountByMedia(mediaID int, mediaType string) (int64, error) {
	var count int64
	err := db.gormdb.Model(&models.Comment{}).Where("media_id = ? AND media_type = ?", mediaID, mediaType).Count(&count).Error
	return count, err
}

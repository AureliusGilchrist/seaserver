package models

// SoundTrack represents an audio track downloaded from Internet Archive.
// Filename on disk uses the UUID; original metadata is preserved here.
type SoundTrack struct {
	BaseModel
	UUID          string `gorm:"column:uuid;uniqueIndex" json:"uuid"`
	Filename      string `gorm:"column:filename" json:"filename"`       // {uuid}.{ext} on disk
	Title         string `gorm:"column:title" json:"title"`
	Artist        string `gorm:"column:artist" json:"artist"`
	IAIdentifier  string `gorm:"column:ia_identifier;index" json:"iaIdentifier"`
	IAFilename    string `gorm:"column:ia_filename" json:"iaFilename"`   // original filename at archive.org
	DurationSec   int    `gorm:"column:duration_sec" json:"durationSec"`
	FileSizeBytes int64  `gorm:"column:file_size_bytes" json:"fileSizeBytes"`
	Format        string `gorm:"column:format" json:"format"`            // "flac" | "mp3" | "ogg" | ...
}

// SoundPlaylist is a server-wide (shared across profiles) playlist of SoundTrack UUIDs.
// TrackUUIDsCSV is a comma-separated list of SoundTrack.UUID values, in playback order.
type SoundPlaylist struct {
	BaseModel
	Name          string `gorm:"column:name" json:"name"`
	TrackUUIDsCSV string `gorm:"column:track_uuids_csv" json:"trackUuidsCsv"`
}

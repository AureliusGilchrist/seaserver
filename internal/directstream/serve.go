package directstream

import (
	"errors"
	"net/http"
	"net/url"

	"github.com/labstack/echo/v4"
)

// ServeEchoStream is a proxy to the current stream identified by its UUID.
// It sits in between the player and the real stream (whether it's a local file, torrent, or http stream).
//
// If this is an EBML stream, it gets the range request from the player, processes it to stream the correct subtitles, and serves the video.
// Otherwise, it just serves the video.
func (m *Manager) ServeEchoStream(streamID string) http.Handler {
	return m.getStreamHandlerByID(streamID)
}

// ServeEchoAttachments serves the attachments loaded into memory from the current stream identified by its UUID.
func (m *Manager) ServeEchoAttachments(streamID string, c echo.Context) error {
	// Get the session for this stream
	session, ok := m.getSessionByStreamID(streamID)
	if !ok {
		return errors.New("no stream")
	}

	filename := c.Param("*")

	filename, _ = url.PathUnescape(filename)

	// Get the attachment
	attachment, ok := session.Stream.GetAttachmentByName(filename)
	if !ok {
		return errors.New("attachment not found")
	}

	return c.Blob(200, attachment.Mimetype, attachment.Data)
}

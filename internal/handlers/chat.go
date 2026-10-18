package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strconv"
	"time"

	"seanime/internal/chat"

	"github.com/labstack/echo/v4"
)

// ─────────────────────────────────────────────────────────────────────────────
// End-to-end encrypted chat.
//
// The server is an untrusted relay: it stores ciphertexts, public keys and
// read-receipt timestamps. Keys are derived on the client; the PIN never
// reaches the server. See internal/chat/chat.go for the storage model and
// seanime-web/src/lib/encryption/chat-crypto.ts for the client-side crypto.

// ChatProfileOk is a minimal profile reference used by the chat endpoints.
type ChatProfileRef struct {
	ID   uint   `json:"id"`
	Name string `json:"name"`
}

// HandleGetChatState
//
//	@summary returns this profile's chat identity state.
//	@desc Returns whether a PIN is set up, and if so the salt, verifier, public key and
//	@desc sealed private key the client needs to derive keys locally. Nothing here can
//	@desc decrypt anything without the profile's PIN.
//	@returns chat.State
//	@route /api/v1/chat/state [GET]
func (h *Handler) HandleGetChatState(c echo.Context) error {
	profileID := h.GetProfileID(c)
	state := chat.State{HasPin: false}
	if ps, ok := h.App.ChatManager.PinState(profileID); ok {
		state.HasPin = true
		state.Salt = ps.Salt
		state.Verifier = ps.Verifier
		state.PublicKey = ps.PublicKey
		state.EncryptedPrivateKey = ps.EncPrivKey
	}
	state.UnreadCount = h.App.ChatManager.UnreadCount(profileID)
	return h.RespondWithData(c, state)
}

// HandleSetupChatPin
//
//	@summary creates or resets this profile's chat identity.
//	@desc The client derives everything locally: a PBKDF2 salt, a verifier (encryption of a
//	@desc constant under the PIN key), an ECDH keypair whose private half is sealed under
//	@desc the PIN key. The server stores only opaque strings. Resetting invalidates old
//	@desc messages (they can no longer be decrypted by this profile).
//	@returns chat.State
//	@route /api/v1/chat/setup-pin [POST]
func (h *Handler) HandleSetupChatPin(c echo.Context) error {
	type body struct {
		Salt                string `json:"salt"`
		Verifier            string `json:"verifier"`
		PublicKey           string `json:"publicKey"`
		EncryptedPrivateKey string `json:"encryptedPrivateKey"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	if b.Salt == "" || b.Verifier == "" || b.PublicKey == "" || b.EncryptedPrivateKey == "" {
		return h.RespondWithError(c, fmt.Errorf("all identity fields are required"))
	}

	profileID := h.GetProfileID(c)
	h.App.ChatManager.SetPinState(profileID, &chat.PinState{
		Salt:       b.Salt,
		Verifier:   b.Verifier,
		PublicKey:  b.PublicKey,
		EncPrivKey: b.EncryptedPrivateKey,
		SetupAt:    time.Now().UTC().Format(time.RFC3339),
	})

	// Let this profile's other devices know the identity changed (e.g. they should re-unlock).
	h.App.WSEventManager.SendEventToProfile(profileID, "chat", chat.EventPayload{Type: "pin-setup"})

	state := chat.State{
		HasPin:              true,
		Salt:                b.Salt,
		Verifier:            b.Verifier,
		PublicKey:           b.PublicKey,
		EncryptedPrivateKey: b.EncryptedPrivateKey,
		UnreadCount:         h.App.ChatManager.UnreadCount(profileID),
	}
	return h.RespondWithData(c, state)
}

// HandleGetChatPeerKey
//
//	@summary returns a peer profile's public chat key.
//	@desc The client needs the peer's ECDH public key to derive the conversation key.
//	@returns chat.PeerKey
//	@route /api/v1/chat/peer-key [GET]
func (h *Handler) HandleGetChatPeerKey(c echo.Context) error {
	peerID, err := parseUintParam(c.QueryParam("profileId"))
	if err != nil {
		return h.RespondWithError(c, err)
	}
	ps, ok := h.App.ChatManager.PinState(peerID)
	if !ok {
		return h.RespondWithData(c, chat.PeerKey{HasPin: false})
	}
	return h.RespondWithData(c, chat.PeerKey{
		HasPin:    true,
		PublicKey: ps.PublicKey,
	})
}

// HandleGetChatConversations
//
//	@summary lists this profile's chat conversations.
//	@desc One entry per profile this profile has exchanged messages with. Last messages are
//	@desc still encrypted; the client decrypts previews locally. Unread counts are computed
//	@desc from read receipts (metadata, not content).
//	@returns chat.Conversations
//	@route /api/v1/chat/conversations [GET]
func (h *Handler) HandleGetChatConversations(c echo.Context) error {
	profileID := h.GetProfileID(c)

	summaries := h.App.ChatManager.Conversations(profileID)

	// Enrich with peer usernames.
	nameById := make(map[uint]string)
	if profiles, err := h.App.ProfileManager.GetAllProfiles(); err == nil {
		for _, p := range profiles {
			nameById[p.ID] = p.Name
		}
	}

	ret := make([]*chat.Conversation, 0, len(summaries))
	for _, s := range summaries {
		conv := &chat.Conversation{
			PeerID:       s.PeerID,
			PeerName:     nameById[s.PeerID],
			LastMessage:  s.LastMessage,
			LastActivity: s.LastActivity,
			UnreadCount:  s.UnreadCount,
			IsPeerTyping: s.IsPeerTyping,
		}
		ret = append(ret, conv)
	}
	return h.RespondWithData(c, chat.Conversations{Conversations: ret})
}

// HandleGetChatMessages
//
//	@summary returns the messages between this profile and a peer.
//	@desc Oldest first, paginated with `beforeId` (the message ID to page back from).
//	@returns chat.Messages
//	@route /api/v1/chat/messages [GET]
func (h *Handler) HandleGetChatMessages(c echo.Context) error {
	profileID := h.GetProfileID(c)

	peerID, err := parseUintParam(c.QueryParam("profileId"))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	limit := 200
	if l, err := parseUintParam(c.QueryParam("limit")); err == nil && l > 0 && l <= 500 {
		limit = int(l)
	}

	msgs := h.App.ChatManager.MessagesBetween(profileID, peerID, limit, c.QueryParam("beforeId"))
	return h.RespondWithData(c, chat.Messages{Messages: msgs})
}

// HandleSendChatMessage
//
//	@summary sends an encrypted message to a peer profile.
//	@desc The payload is the {iv, ciphertext} pair the client encrypted with the
//	@desc conversation key. The server relays it over websocket to the recipient's
//	@desc devices and echoes to the sender's other devices.
//	@returns chat.Message
//	@route /api/v1/chat/send [POST]
func (h *Handler) HandleSendChatMessage(c echo.Context) error {
	type body struct {
		ToProfileID uint   `json:"toProfileId"`
		IV          string `json:"iv"`
		Ciphertext  string `json:"ciphertext"`
		ReplyToID   string `json:"replyToId"`
		ImageID     string `json:"imageId"`
		ImageIV     string `json:"imageIv"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}

	fromID := h.GetProfileID(c)
	if fromID == 0 {
		return h.RespondWithError(c, fmt.Errorf("must be logged in"))
	}
	if b.ToProfileID == 0 || b.ToProfileID == fromID {
		return h.RespondWithError(c, fmt.Errorf("invalid recipient"))
	}
	if len(b.Ciphertext) > chat.MaxMessageChars {
		return h.RespondWithError(c, fmt.Errorf("message too large"))
	}
	if b.Ciphertext == "" && b.ImageID == "" {
		return h.RespondWithError(c, fmt.Errorf("empty message"))
	}

	// Peer must have a chat identity — otherwise they could never decrypt.
	if _, ok := h.App.ChatManager.PinState(b.ToProfileID); !ok {
		return h.RespondWithError(c, fmt.Errorf("that profile hasn't set up chat yet"))
	}

	// Validate reply target belongs to this conversation.
	if b.ReplyToID != "" {
		parent, ok := h.App.ChatManager.GetMessage(b.ReplyToID)
		if !ok {
			return h.RespondWithError(c, fmt.Errorf("reply target not found"))
		}
		if !isParticipant(parent, fromID) {
			return h.RespondWithError(c, fmt.Errorf("reply target not found"))
		}
	}

	now := time.Now().UTC().Format(time.RFC3339)
	msg := &chat.Message{
		ID:         newChatID(),
		From:       fromID,
		To:         b.ToProfileID,
		IV:         b.IV,
		Ciphertext: b.Ciphertext,
		CreatedAt:  now,
		ReplyToID:  b.ReplyToID,
		ImageID:    b.ImageID,
		ImageIV:    b.ImageIV,
	}
	h.App.ChatManager.AddMessage(msg)

	payload := chat.EventPayload{Type: "message", Message: msg}
	h.App.WSEventManager.SendEventToProfile(b.ToProfileID, "chat", payload)
	if b.ToProfileID != fromID {
		h.App.WSEventManager.SendEventToProfile(fromID, "chat", payload)
	}
	return h.RespondWithData(c, msg)
}

// HandleEditChatMessage
//
//	@summary edits an encrypted message.
//	@desc Only the sender can edit. The client re-encrypts the new text; the server just
//	@desc swaps the ciphertext and marks the edit.
//	@returns chat.Message
//	@route /api/v1/chat/edit [POST]
func (h *Handler) HandleEditChatMessage(c echo.Context) error {
	type body struct {
		MessageID  string `json:"messageId"`
		IV         string `json:"iv"`
		Ciphertext string `json:"ciphertext"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	fromID := h.GetProfileID(c)
	if len(b.Ciphertext) > chat.MaxMessageChars {
		return h.RespondWithError(c, fmt.Errorf("message too large"))
	}

	msg, ok := h.App.ChatManager.UpdateMessage(b.MessageID, func(m *chat.Message) bool {
		if m.From != fromID || m.DeletedAt != "" {
			return false
		}
		m.IV = b.IV
		m.Ciphertext = b.Ciphertext
		m.EditedAt = time.Now().UTC().Format(time.RFC3339)
		return true
	})
	if !ok {
		return h.RespondWithError(c, fmt.Errorf("message not found or cannot be edited"))
	}

	payload := chat.EventPayload{Type: "message", Message: msg}
	h.App.WSEventManager.SendEventToProfile(msg.To, "chat", payload)
	h.App.WSEventManager.SendEventToProfile(msg.From, "chat", payload)
	return h.RespondWithData(c, msg)
}

// HandleDeleteChatMessage
//
//	@summary deletes a message for both participants.
//	@desc The sender or the recipient can delete. The server clears the ciphertext (so the
//	@desc content is gone even from storage) and notifies both sides.
//	@returns chat.Message
//	@route /api/v1/chat/delete [POST]
func (h *Handler) HandleDeleteChatMessage(c echo.Context) error {
	type body struct {
		MessageID string `json:"messageId"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	fromID := h.GetProfileID(c)

	msg, ok := h.App.ChatManager.UpdateMessage(b.MessageID, func(m *chat.Message) bool {
		if !isParticipant(m, fromID) || m.DeletedAt != "" {
			return false
		}
		m.DeletedAt = time.Now().UTC().Format(time.RFC3339)
		m.Ciphertext = ""
		m.IV = ""
		m.ImageID = ""
		m.ImageIV = ""
		m.Reactions = nil
		return true
	})
	if !ok {
		return h.RespondWithError(c, fmt.Errorf("message not found or already deleted"))
	}

	payload := chat.EventPayload{Type: "message", Message: msg}
	h.App.WSEventManager.SendEventToProfile(msg.To, "chat", payload)
	h.App.WSEventManager.SendEventToProfile(msg.From, "chat", payload)
	return h.RespondWithData(c, msg)
}

// HandleReactChatMessage
//
//	@summary sets or clears this profile's encrypted reaction on a message.
//	@desc An empty ciphertext removes the reaction. Reactions are encrypted with the
//	@desc conversation key, so the server stores only opaque blobs.
//	@returns chat.Message
//	@route /api/v1/chat/react [POST]
func (h *Handler) HandleReactChatMessage(c echo.Context) error {
	type body struct {
		MessageID  string `json:"messageId"`
		IV         string `json:"iv"`
		Ciphertext string `json:"ciphertext"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	fromID := h.GetProfileID(c)

	msg, ok := h.App.ChatManager.UpdateMessage(b.MessageID, func(m *chat.Message) bool {
		if !isParticipant(m, fromID) || m.DeletedAt != "" {
			return false
		}
		if b.Ciphertext == "" {
			delete(m.Reactions, fromID)
		} else {
			if m.Reactions == nil {
				m.Reactions = make(map[uint]chat.Reaction)
			}
			m.Reactions[fromID] = chat.Reaction{IV: b.IV, Ciphertext: b.Ciphertext}
		}
		return true
	})
	if !ok {
		return h.RespondWithError(c, fmt.Errorf("message not found"))
	}

	payload := chat.EventPayload{Type: "message", Message: msg}
	h.App.WSEventManager.SendEventToProfile(msg.To, "chat", payload)
	h.App.WSEventManager.SendEventToProfile(msg.From, "chat", payload)
	return h.RespondWithData(c, msg)
}

// HandleMarkChatRead
//
//	@summary marks all messages from a peer as read.
//	@desc Read receipts are timing metadata (the server already sees delivery timing). The
//	@desc peer is notified so their UI can show "read".
//	@returns bool
//	@route /api/v1/chat/mark-read [POST]
func (h *Handler) HandleMarkChatRead(c echo.Context) error {
	type body struct {
		WithProfileID uint `json:"withProfileId"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	me := h.GetProfileID(c)
	readAt := time.Now().UTC().Format(time.RFC3339)
	h.App.ChatManager.MarkRead(me, b.WithProfileID, readAt)

	h.App.WSEventManager.SendEventToProfile(b.WithProfileID, "chat", chat.EventPayload{
		Type:   "read",
		FromID: me,
		At:     readAt,
	})
	return h.RespondWithData(c, true)
}

// HandleChatTyping
//
//	@summary relays a typing indicator to a peer.
//	@desc Fire-and-forget: the server forwards the ping if the peer is online. No storage.
//	@returns bool
//	@route /api/v1/chat/typing [POST]
func (h *Handler) HandleChatTyping(c echo.Context) error {
	type body struct {
		ToProfileID uint `json:"toProfileId"`
		IsTyping    bool `json:"isTyping"`
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	me := h.GetProfileID(c)
	if me == 0 || b.ToProfileID == 0 || b.ToProfileID == me {
		return h.RespondWithData(c, true)
	}
	h.App.ChatManager.SetTyping(me, b.IsTyping)
	h.App.WSEventManager.SendEventToProfile(b.ToProfileID, "chat", chat.EventPayload{
		Type:     "typing",
		FromID:   me,
		IsTyping: b.IsTyping,
	})
	return h.RespondWithData(c, true)
}

// HandleUploadChatImage
//
//	@summary uploads an encrypted image blob for a chat message.
//	@desc The client encrypts the image bytes with the conversation key before upload. The
//	@desc returned imageId goes into the message. Only the two participants can fetch it.
//	@returns chat.ImageUpload
//	@route /api/v1/chat/image [POST]
func (h *Handler) HandleUploadChatImage(c echo.Context) error {
	type body struct {
		ToProfileID uint   `json:"toProfileId"`
		IV          string `json:"iv"`
		Ciphertext  string `json:"ciphertext"` // base64 of the encrypted bytes
	}
	var b body
	if err := c.Bind(&b); err != nil {
		return h.RespondWithError(c, err)
	}
	fromID := h.GetProfileID(c)
	if b.ToProfileID == 0 || b.ToProfileID == fromID {
		return h.RespondWithError(c, fmt.Errorf("invalid recipient"))
	}
	if _, ok := h.App.ChatManager.PinState(b.ToProfileID); !ok {
		return h.RespondWithError(c, fmt.Errorf("that profile hasn't set up chat yet"))
	}

	data, err := base64Decode(b.Ciphertext)
	if err != nil {
		return h.RespondWithError(c, fmt.Errorf("invalid image payload"))
	}
	if len(data) == 0 {
		return h.RespondWithError(c, fmt.Errorf("empty image payload"))
	}

	id := newChatID()
	if err := h.App.ChatManager.StoreImage(id, fromID, b.ToProfileID, data); err != nil {
		return h.RespondWithError(c, err)
	}
	return h.RespondWithData(c, chat.ImageUpload{ImageID: id})
}

// HandleServeChatImage
//
//	@summary serves an encrypted chat image blob.
//	@desc Only the two conversation participants can fetch. The bytes are still encrypted;
//	@desc the client decrypts with the conversation key before rendering.
//	@returns string
//	@route /api/v1/chat/image/:id [GET]
func (h *Handler) HandleServeChatImage(c echo.Context) error {
	me := h.GetProfileID(c)
	id := c.Param("id")
	data, meta, ok := h.App.ChatManager.GetImage(id)
	if !ok {
		return h.RespondWithError(c, fmt.Errorf("image not found"))
	}
	if meta.From != me && meta.To != me {
		return h.RespondWithError(c, fmt.Errorf("not your conversation"))
	}
	return c.Blob(200, "application/octet-stream", data)
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile comments tab

// HandleGetProfileComments
//
//	@summary returns the comments a profile has made, newest first.
//	@desc Used by the profile page's Comments tab: every comment the profile left on any
//	@desc show or manga, with the media reference and timestamp.
//	@returns handlers.ProfileCommentsResponse
//	@route /api/v1/profile/comments [GET]
func (h *Handler) HandleGetProfileComments(c echo.Context) error {
	profileID := uint(0)
	if s := c.QueryParam("profileId"); s != "" {
		v, err := parseUintParam(s)
		if err != nil {
			return h.RespondWithError(c, err)
		}
		profileID = v
	} else {
		profileID = h.GetProfileID(c)
	}

	comments, err := h.App.Database.GetCommentsByProfile(int(profileID))
	if err != nil {
		return h.RespondWithError(c, err)
	}

	items := make([]*ProfileCommentItem, 0, len(comments))
	for _, cm := range comments {
		if cm.ParentID != nil {
			// Replies are shown under their parent on the media page; the tab lists top-level activity.
			continue
		}
		items = append(items, &ProfileCommentItem{
			ID:        cm.ID,
			MediaID:   cm.MediaID,
			MediaType: cm.MediaType,
			Content:   cm.Content,
			IsEdited:  cm.IsEdited,
			IsSpoiler: cm.IsSpoiler,
			CreatedAt: cm.CreatedAt,
			UpdatedAt: cm.UpdatedAt,
		})
	}

	h.resolveCommentTitles(profileID, items)

	return h.RespondWithData(c, ProfileCommentsResponse{Comments: items, TotalCount: int64(len(items))})
}

// resolveCommentTitles fills in the media title of each comment from the comment
// author's cached AniList collection (memory or disk copy — never blocks on a
// fresh fetch). Comments are left from a media page, so the author's collection
// almost always contains the media. Unresolved titles stay empty and the client
// falls back to the media id.
func (h *Handler) resolveCommentTitles(profileID uint, items []*ProfileCommentItem) {
	needAnime, needManga := false, false
	for _, it := range items {
		if it.MediaType == "manga" {
			needManga = true
		} else {
			needAnime = true
		}
	}

	animeTitles := map[int]string{}
	mangaTitles := map[int]string{}
	if needAnime {
		if col, err := h.App.AnilistClientManager.GetAnimeCollection(profileID); err == nil && col.MediaListCollection != nil {
			for _, list := range col.MediaListCollection.Lists {
				if list == nil {
					continue
				}
				for _, e := range list.Entries {
					if e == nil || e.Media == nil {
						continue
					}
					animeTitles[e.Media.ID] = e.Media.GetPreferredTitle()
				}
			}
		}
	}
	if needManga {
		if col, err := h.App.AnilistClientManager.GetMangaCollection(profileID); err == nil && col.MediaListCollection != nil {
			for _, list := range col.MediaListCollection.Lists {
				if list == nil {
					continue
				}
				for _, e := range list.Entries {
					if e == nil || e.Media == nil {
						continue
					}
					mangaTitles[e.Media.ID] = e.Media.GetPreferredTitle()
				}
			}
		}
	}

	for _, it := range items {
		if it.MediaType == "manga" {
			it.MediaTitle = mangaTitles[it.MediaID]
		} else {
			it.MediaTitle = animeTitles[it.MediaID]
		}
	}
}

// ProfileCommentItem is one comment in a profile's Comments tab.
type ProfileCommentItem struct {
	ID         uint      `json:"id"`
	MediaID    int       `json:"mediaId"`
	MediaType  string    `json:"mediaType"`
	MediaTitle string    `json:"mediaTitle"`
	Content    string    `json:"content"`
	IsEdited   bool      `json:"isEdited"`
	IsSpoiler  bool      `json:"isSpoiler"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// ProfileCommentsResponse is the response of the profile comments endpoint.
type ProfileCommentsResponse struct {
	Comments   []*ProfileCommentItem `json:"comments"`
	TotalCount int64                 `json:"totalCount"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers

func isParticipant(m *chat.Message, profileID uint) bool {
	return m.From == profileID || m.To == profileID
}

func newChatID() string {
	b := make([]byte, 12)
	if _, err := rand.Read(b); err != nil {
		// Fall back to time-based uniqueness; collisions only reorder rendering.
		return fmt.Sprintf("m%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

func base64Decode(s string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(s)
}

func parseUintParam(s string) (uint, error) {
	v, err := strconv.ParseUint(s, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid value %q", s)
	}
	return uint(v), nil
}

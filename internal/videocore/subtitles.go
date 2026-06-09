package videocore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"seanime/internal/mkvparser"
	"seanime/internal/util"
	"strings"
)

// CloudflareChallengeErrorPrefix marks a subtitle fetch that was blocked by a Cloudflare
// anti-bot challenge. Clients (e.g. the denshi renderer) detect this prefix and re-fetch the
// content through a real browser surface, then resubmit the raw content for conversion.
const CloudflareChallengeErrorPrefix = "cloudflare_challenge"

// FetchAndConvertSubsTo fetches a subtitle file and converts it to the target format.
//
// The provided client should be the video proxy client (h.getVideoProxyClient()) so the
// request egresses through the same transport/SOCKS5 proxy that successfully fetches the
// HLS stream. Subtitle CDNs (e.g. swiftstream.top) sit behind Cloudflare and will return a
// "Just a moment..." HTML challenge (HTTP 200 or 403) to a bare client from a flagged IP.
func (vc *VideoCore) FetchAndConvertSubsTo(client *http.Client, subUrl string, to int) (string, error) {
	if client == nil {
		client = http.DefaultClient
	}

	r, err := http.NewRequest(http.MethodGet, subUrl, nil)
	if err != nil {
		return "", fmt.Errorf("invalid subtitle URL: %w", err)
	}
	r.Header.Set("User-Agent", util.GetRandomUserAgent())
	r.Header.Set("Accept", "*/*")

	resp, err := client.Do(r)
	if err != nil {
		return "", fmt.Errorf("failed to fetch subtitle file: %w", err)
	}

	bodyBytes, readErr := io.ReadAll(resp.Body)
	resp.Body.Close()
	if readErr != nil {
		return "", fmt.Errorf("failed to read subtitle response: %w", readErr)
	}

	payload := strings.TrimSpace(string(bodyBytes))

	// Some subtitle CDNs (e.g. swiftstream.top) sit behind a Cloudflare anti-bot challenge and
	// return a "Just a moment..." page — often with a 403/503 status — to a plain HTTP client.
	// When that happens, fall back to a headless browser that can execute the JS challenge and
	// fetch the real subtitle content. Converting the challenge HTML directly yields garbage.
	if isCloudflareChallenge(resp.StatusCode, payload) {
		vc.logger.Warn().
			Str("url", subUrl).
			Int("status", resp.StatusCode).
			Msg("videocore: Subtitle URL is behind a Cloudflare challenge")

		// By default, surface a structured error so a real (non-automated) browser surface — the
		// denshi Electron renderer — can solve the challenge and resubmit the raw content for
		// conversion. The in-process headless solver is opt-in (SEANIME_CF_BACKEND_SOLVER=1):
		// hardened "managed" challenges detect the CDP automation and never clear, and waiting on
		// them only stalls the request.
		if os.Getenv("SEANIME_CF_BACKEND_SOLVER") != "1" {
			return "", fmt.Errorf("%s: %s", CloudflareChallengeErrorPrefix, subUrl)
		}

		vc.logger.Info().Str("url", subUrl).Msg("videocore: Attempting in-process headless solve")
		solved, solveErr := vc.solveCloudflareAndFetch(context.Background(), subUrl)
		if solveErr != nil {
			return "", fmt.Errorf("%s: headless solve failed: %w", CloudflareChallengeErrorPrefix, solveErr)
		}
		payload = strings.TrimSpace(solved)
		if payload == "" || isCloudflareChallenge(0, payload) {
			return "", fmt.Errorf("%s: headless solve did not return subtitle content", CloudflareChallengeErrorPrefix)
		}
		vc.logger.Info().Str("url", subUrl).Msg("videocore: Headless Cloudflare solve succeeded")
	} else if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("subtitle URL returned HTTP %d", resp.StatusCode)
	}

	url := subUrl

	from := mkvparser.SubtitleTypeUnknown

	// Strip query params before checking extension
	rawUrl := url
	if idx := strings.Index(rawUrl, "?"); idx != -1 {
		rawUrl = rawUrl[:idx]
	}
	ext := util.FileExt(rawUrl)

	switch ext {
	case ".ass":
		from = mkvparser.SubtitleTypeASS
	case ".ssa":
		from = mkvparser.SubtitleTypeSSA
	case ".srt":
		from = mkvparser.SubtitleTypeSRT
	case ".vtt":
		from = mkvparser.SubtitleTypeWEBVTT
	case ".ttml":
		from = mkvparser.SubtitleTypeTTML
	case ".stl":
		from = mkvparser.SubtitleTypeSTL
	case ".txt":
		from = mkvparser.SubtitleTypeUnknown
	default:
		from = mkvparser.DetectSubtitleType(payload)
	}

	if from == mkvparser.SubtitleTypeUnknown {
		return "", errors.New("failed to detect subtitle format from content")
	}

	if from == to {
		return payload, nil
	}

	return vc.ConvertSubsTo(payload, from, to)
}

func (vc *VideoCore) ConvertSubsTo(content string, from int, to int) (ret string, err error) {
	if from == mkvparser.SubtitleTypeUnknown {
		from = mkvparser.DetectSubtitleType(content)
		if from == mkvparser.SubtitleTypeUnknown {
			return "", errors.New("failed to detect subtitle format from content")
		}
	}

	if from == to {
		return content, nil
	}

	switch to {
	case mkvparser.SubtitleTypeASS:
		ret, err = mkvparser.ConvertToASS(content, from)
		if err != nil {
			return "", fmt.Errorf("failed to convert subtitle file: %w", err)
		}
	case mkvparser.SubtitleTypeWEBVTT:
		ret, err = mkvparser.ConvertToVTT(content, from)
		if err != nil {
			return "", fmt.Errorf("failed to convert subtitle file: %w", err)
		}
	default:
		return "", errors.New("unsupported subtitle format for conversion")
	}
	return
}

type (
	GenerateSubtitleFileOptions struct {
		Filename  string
		Content   string
		Number    int64
		ConvertTo int
	}
)

func (vc *VideoCore) GenerateMkvSubtitleTrack(opts GenerateSubtitleFileOptions) (*mkvparser.TrackInfo, error) {
	filename := opts.Filename
	content := opts.Content
	number := opts.Number

	ext := util.FileExt(filename)

	newContent := content
	var err error
	var from int
	switch ext {
	case ".ass":
		from = mkvparser.SubtitleTypeASS
	case ".ssa":
		from = mkvparser.SubtitleTypeSSA
	case ".srt":
		from = mkvparser.SubtitleTypeSRT
	case ".vtt":
		from = mkvparser.SubtitleTypeWEBVTT
	case ".ttml":
		from = mkvparser.SubtitleTypeTTML
	case ".stl":
		from = mkvparser.SubtitleTypeSTL
	case ".txt":
		from = mkvparser.SubtitleTypeUnknown
	default:
		err = errors.New("unsupported subtitle format")
	}
	vc.logger.Debug().
		Str("filename", filename).
		Str("ext", ext).
		Int("detected", from).
		Int("convertTo", opts.ConvertTo).
		Msg("videocore: Converting uploaded subtitle file")

	if opts.ConvertTo != from {
		if opts.ConvertTo == mkvparser.SubtitleTypeASS {
			newContent, err = mkvparser.ConvertToASS(content, from)
			if err != nil {
				return nil, fmt.Errorf("failed to convert subtitle file: %w", err)
			}
		} else {
			newContent, err = mkvparser.ConvertToVTT(content, from)
			if err != nil {
				return nil, fmt.Errorf("failed to convert subtitle file: %w", err)
			}
		}
	}

	// Extract base name without extension (e.g. "title.eng.srt" -> "title.eng")
	baseName := strings.TrimSuffix(filename, ext)

	// Extract potential language code from the last part of the base name
	var lang string
	if lastDot := strings.LastIndex(baseName, "."); lastDot != -1 {
		lang = baseName[lastDot+1:]
		baseName = baseName[:lastDot] // Remove language part from name
	} else {
		lang = "file"
	}

	// Clean up language code
	lang = strings.ReplaceAll(lang, "-", " ")
	lang = strings.ReplaceAll(lang, "_", " ")
	lang = strings.ReplaceAll(lang, ".", " ")
	lang = strings.ReplaceAll(lang, ",", " ")
	lang = strings.TrimSpace(lang)

	// Use fallback if language is empty
	if lang == "" {
		lang = fmt.Sprintf("Added track %d", number+1)
	}

	// Handle placeholder case
	if baseName == "PLACEHOLDER" {
		baseName = fmt.Sprintf("External (#%d)", number)
		lang = "und"
	}

	name := baseName

	codecId := "S_TEXT/ASS"
	if opts.ConvertTo != mkvparser.SubtitleTypeASS {
		codecId = "S_TEXT/UTF8"
	}

	track := &mkvparser.TrackInfo{
		Number:       number,
		UID:          uint64(number + 900),
		Type:         mkvparser.TrackTypeSubtitle,
		CodecID:      codecId,
		Name:         name,
		Language:     lang,
		LanguageIETF: lang,
		Default:      false,
		Forced:       false,
		Enabled:      true,
		CodecPrivate: newContent,
	}

	vc.logger.Debug().Msg("videocore: Subtitle track generated")

	return track, nil
}

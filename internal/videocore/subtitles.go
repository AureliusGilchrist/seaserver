package videocore

import (
	"errors"
	"fmt"
	"seanime/internal/mkvparser"
	"seanime/internal/util"
	"strings"
	"time"

	"github.com/imroc/req/v3"
)

func extractOrigin(rawUrl string) string {
	// Returns "https://host" from a full URL, or the URL itself on failure.
	if i := strings.Index(rawUrl, "://"); i != -1 {
		rest := rawUrl[i+3:]
		if j := strings.Index(rest, "/"); j != -1 {
			return rawUrl[:i+3+j]
		}
		return rawUrl
	}
	return rawUrl
}

func (vc *VideoCore) FetchAndConvertSubsTo(url string, to int) (string, error) {
	client := req.C()
	client.SetTimeout(30 * time.Second)

	// Parse the origin from the URL to send as Referer, which some CDNs require.
	referer := url
	if idx := strings.Index(url, "?"); idx != -1 {
		referer = url[:idx]
	}

	resp := client.Get(url).
		SetHeader("Referer", referer).
		SetHeader("Origin", extractOrigin(url)).
		SetHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36").
		Do()

	if resp.IsErrorState() {
		return "", errors.New("failed to fetch subtitle file")
	}

	payload := resp.String()

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

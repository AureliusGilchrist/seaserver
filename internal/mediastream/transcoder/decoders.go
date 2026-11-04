package transcoder

import (
	"os/exec"
	"strings"
	"sync"

	"seanime/internal/mediastream/videofile"
)

var (
	ffmpegDecodersMu    sync.Mutex
	ffmpegDecodersCache = map[string]ffmpegCodecs{}
)

// ffmpegCodecs is what one ffmpeg binary can decode.
type ffmpegCodecs struct {
	// codecs are the codecs with at least one decoder (h264, aac...).
	codecs map[string]bool
	// decoders are the decoders themselves (h264, h264_cuvid...). A codec with no "(decoders: ...)"
	// list has one decoder of the same name.
	decoders map[string]bool
}

// parseFFmpegDecoders reads the output of `ffmpeg -codecs`: a line starts with its flags, then the
// codec's name, and the first flag is D when this build can decode it.
func parseFFmpegDecoders(output string) map[string]bool {
	return parseFFmpegCodecs(output).codecs
}

func parseFFmpegCodecs(output string) ffmpegCodecs {
	ret := ffmpegCodecs{codecs: map[string]bool{}, decoders: map[string]bool{}}
	_, table, found := strings.Cut(output, "-------")
	if !found {
		return ret
	}
	for _, line := range strings.Split(table, "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 || len(fields[0]) != 6 || fields[0][0] != 'D' {
			continue
		}
		ret.codecs[fields[1]] = true
		if _, list, ok := strings.Cut(line, "(decoders:"); ok {
			list, _, _ = strings.Cut(list, ")")
			for _, name := range strings.Fields(list) {
				ret.decoders[name] = true
			}
		} else {
			ret.decoders[fields[1]] = true
		}
	}
	return ret
}

// getFFmpegDecoders returns what the ffmpeg binary can decode, or nil if that could not be found out.
func getFFmpegDecoders(ffmpegPath string) map[string]bool {
	return getFFmpegCodecs(ffmpegPath).codecs
}

// getFFmpegDecoderNames returns the decoders of the ffmpeg binary, or nil if that could not be found out.
func getFFmpegDecoderNames(ffmpegPath string) map[string]bool {
	return getFFmpegCodecs(ffmpegPath).decoders
}

func getFFmpegCodecs(ffmpegPath string) ffmpegCodecs {
	ffmpegBin := ffmpegPath
	if ffmpegBin == "" {
		ffmpegBin = "ffmpeg"
	}

	ffmpegDecodersMu.Lock()
	defer ffmpegDecodersMu.Unlock()

	if decoders, ok := ffmpegDecodersCache[ffmpegBin]; ok {
		return decoders
	}
	var decoders ffmpegCodecs
	if out, err := exec.Command(ffmpegBin, "-hide_banner", "-codecs").CombinedOutput(); err == nil {
		if parsed := parseFFmpegCodecs(string(out)); len(parsed.codecs) > 0 {
			decoders = parsed
		}
	}
	ffmpegDecodersCache[ffmpegBin] = decoders
	return decoders
}

// keepDecodableAudios leaves out the tracks ffmpeg has no decoder for: asking for one fails every
// time and the player waits on it forever. With nothing decodable they all stay, so a failure shows
// up as one rather than as a file with no audio.
func keepDecodableAudios(audios []videofile.Audio, decoders map[string]bool) []videofile.Audio {
	if decoders == nil {
		return audios
	}
	decodable := make([]videofile.Audio, 0, len(audios))
	for _, audio := range audios {
		if decoders[audio.Codec] {
			decodable = append(decodable, audio)
		}
	}
	if len(decodable) == 0 {
		return audios
	}
	return decodable
}

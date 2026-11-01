package transcoder

import (
	"os/exec"
	"strings"
	"sync"

	"seanime/internal/mediastream/videofile"
)

var (
	ffmpegDecodersMu    sync.Mutex
	ffmpegDecodersCache = map[string]map[string]bool{}
)

// parseFFmpegDecoders reads the output of `ffmpeg -codecs`: a line starts with its flags, then the
// codec's name, and the first flag is D when this build can decode it.
func parseFFmpegDecoders(output string) map[string]bool {
	decoders := map[string]bool{}
	_, table, found := strings.Cut(output, "-------")
	if !found {
		return decoders
	}
	for _, line := range strings.Split(table, "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && len(fields[0]) == 6 && fields[0][0] == 'D' {
			decoders[fields[1]] = true
		}
	}
	return decoders
}

// getFFmpegDecoders returns what the ffmpeg binary can decode, or nil if that could not be found out.
func getFFmpegDecoders(ffmpegPath string) map[string]bool {
	ffmpegBin := ffmpegPath
	if ffmpegBin == "" {
		ffmpegBin = "ffmpeg"
	}

	ffmpegDecodersMu.Lock()
	defer ffmpegDecodersMu.Unlock()

	if decoders, ok := ffmpegDecodersCache[ffmpegBin]; ok {
		return decoders
	}
	var decoders map[string]bool
	if out, err := exec.Command(ffmpegBin, "-hide_banner", "-codecs").CombinedOutput(); err == nil {
		if parsed := parseFFmpegDecoders(string(out)); len(parsed) > 0 {
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

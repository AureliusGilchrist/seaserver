package transcoder

import (
	"testing"

	"seanime/internal/mediastream/videofile"
)

const ffmpegCodecsSample = `Codecs:
 D..... = Decoding supported
 .E.... = Encoding supported
 -------
 D.A.L. aac                  AAC (Advanced Audio Coding)
 .EA.L. eac3                 ATSC A/52B (AC-3, E-AC-3)
 .EV.L. hevc                 H.265 / HEVC
 D.VIL. h264                 H.264
`

func TestParseFFmpegDecoders(t *testing.T) {
	decoders := parseFFmpegDecoders(ffmpegCodecsSample)
	if !decoders["aac"] || !decoders["h264"] {
		t.Fatalf("decodable codecs missing: %v", decoders)
	}
	if decoders["eac3"] || decoders["hevc"] {
		t.Fatalf("encode-only codecs listed as decodable: %v", decoders)
	}
}

func TestKeepDecodableAudios(t *testing.T) {
	audios := []videofile.Audio{{Index: 0, Codec: "aac"}, {Index: 1, Codec: "eac3"}}
	decoders := parseFFmpegDecoders(ffmpegCodecsSample)

	kept := keepDecodableAudios(audios, decoders)
	if len(kept) != 1 || kept[0].Index != 0 {
		t.Fatalf("got %+v, want only the aac track", kept)
	}
	if got := keepDecodableAudios(audios, nil); len(got) != 2 {
		t.Fatalf("unknown decoders should keep every track, got %+v", got)
	}
	onlyEac3 := audios[1:]
	if got := keepDecodableAudios(onlyEac3, decoders); len(got) != 1 {
		t.Fatalf("nothing decodable should keep every track, got %+v", got)
	}
}

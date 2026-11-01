package transcoder

import (
	"strings"
	"testing"

	"seanime/internal/mediastream/videofile"
)

func TestGetCopyMasterOffersOnlyTheSourceVideo(t *testing.T) {
	codec := `hvc1.1.4.L-99.B0`
	fs := &FileStream{Info: &videofile.MediaInfo{
		Video: &videofile.Video{MimeCodec: &codec, Width: 1920, Height: 1080, Bitrate: 2000000},
	}}

	master := fs.GetCopyMaster()

	if got := strings.Count(master, "#EXT-X-STREAM-INF"); got != 1 {
		t.Fatalf("got %d qualities, want 1:\n%s", got, master)
	}
	if !strings.Contains(master, "./original/index.m3u8") {
		t.Fatalf("source video missing:\n%s", master)
	}
	if !strings.Contains(master, `CODECS="hvc1.1.4.L150.B0"`) {
		t.Fatalf("invalid level was not replaced:\n%s", master)
	}
}

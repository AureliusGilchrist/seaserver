package transcoder

import "testing"

func TestHwDecodeFlagsOnlyForVideoEncodes(t *testing.T) {
	hw := HwAccelSettings{Name: "nvidia", DecodeFlags: []string{"-init_hw_device", "cuda=cu", "-hwaccel", "cuda"}}

	if got := hwDecodeFlags(AudioF, hw); len(got) != 0 {
		t.Fatalf("audio encode got hardware decode flags %v", got)
	}
	if got := hwDecodeFlags(VideoF|Transmux, hw); len(got) != 0 {
		t.Fatalf("video copy got hardware decode flags %v", got)
	}
	if got := hwDecodeFlags(VideoF, hw); len(got) != 4 {
		t.Fatalf("video encode lost its hardware decode flags: %v", got)
	}
}

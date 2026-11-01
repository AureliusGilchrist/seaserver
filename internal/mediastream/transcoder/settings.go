package transcoder

import "os"

func GetEnvOr(env string, def string) string {
	out := os.Getenv(env)
	if out == "" {
		return def
	}
	return out
}

type HwAccelSettings struct {
	Name          string   `json:"name"`
	DecodeFlags   []string `json:"decodeFlags"`
	EncodeFlags   []string `json:"encodeFlags"`
	ScaleFilter   string   `json:"scaleFilter"`
	WithForcedIdr bool     `json:"removeForcedIdr"`
}

// softwareHwAccelName is the name of the settings that use no hardware at all.
const softwareHwAccelName = "disabled"

// softwareFallbackPreset is what the CPU encodes with once the hardware has failed. It has to keep up
// with playback on a Blu-ray source, and a stream that keeps buffering is worse than a larger one.
const softwareFallbackPreset = "veryfast"

// How far the hardware has been given up on (Settings.hwAccelStep).
const (
	hwAccelFull int32 = iota
	hwAccelEncodeOnly
	hwAccelSoftware
)

// activeHwAccel returns the settings a new ffmpeg should use: the configured ones, until they have
// failed (see fallBackFrom).
func (s *Settings) activeHwAccel() HwAccelSettings {
	switch s.hwAccelStep.Load() {
	case hwAccelEncodeOnly:
		encodeOnly := s.HwAccel
		encodeOnly.DecodeFlags = nil
		return encodeOnly
	case hwAccelSoftware:
		return s.SoftwareHwAccel
	}
	return s.HwAccel
}

// fallBackFrom gives up one step from the settings that just failed, until the transcoder is
// recreated: a GPU that cannot decode can often still encode, which is far faster than the CPU.
// Encoders failing together were all on the same settings, so they only take one step between them.
func (s *Settings) fallBackFrom(failed HwAccelSettings) {
	if len(failed.DecodeFlags) > 0 {
		s.hwAccelStep.CompareAndSwap(hwAccelFull, hwAccelEncodeOnly)
		return
	}
	s.hwAccelStep.Store(hwAccelSoftware)
}

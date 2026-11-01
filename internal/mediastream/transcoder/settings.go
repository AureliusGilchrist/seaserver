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

// activeHwAccel returns the settings a new ffmpeg should use: the configured ones, until a hardware
// encoder has failed (see fallBackToSoftware).
func (s *Settings) activeHwAccel() HwAccelSettings {
	if s.softwareOnly.Load() {
		return s.SoftwareHwAccel
	}
	return s.HwAccel
}

// fallBackToSoftware makes every later encode use the CPU, until the transcoder is recreated.
func (s *Settings) fallBackToSoftware() {
	s.softwareOnly.Store(true)
}

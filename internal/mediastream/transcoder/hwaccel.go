package transcoder

import (
	"runtime"
	"slices"
	"strings"

	"github.com/goccy/go-json"
)

type (
	HwAccelOptions struct {
		Kind           string
		Preset         string
		CustomSettings string
		FfmpegPath     string
		// Role says which settings these are in the log: the configured ones, or the CPU spare the
		// transcoder keeps for when the hardware fails. Empty means "configured".
		Role string
	}
)

// WarmUpHardwareAccel asks ffmpeg what it can decode in the background, so the first stream doesn't
// pay the cold-start cost of that. Safe to call multiple times.
func WarmUpHardwareAccel(ffmpegPath string) {
	_ = getFFmpegDecoders(ffmpegPath)
}

func GetHardwareAccelSettings(opts HwAccelOptions) HwAccelSettings {
	name := opts.Kind
	if name == "" || name == "auto" || name == "cpu" || name == "none" {
		name = "disabled"
	}
	role := opts.Role
	if role == "" {
		role = "configured"
	}
	streamLogger.Debug().Msgf("transcoder: Hardware acceleration (%s): %s", role, name)

	var customHwAccelSettings HwAccelSettings
	if opts.CustomSettings != "" && name == "custom" {
		err := json.Unmarshal([]byte(opts.CustomSettings), &customHwAccelSettings)
		if err != nil {
			streamLogger.Error().Err(err).Msg("transcoder: Failed to parse custom hardware acceleration settings, falling back to CPU")
			name = "disabled"
		}
		customHwAccelSettings.Name = "custom"
	} else if opts.CustomSettings == "" && name == "custom" {
		name = "disabled"
	}

	defaultOSDevice := "/dev/dri/renderD128"
	switch runtime.GOOS {
	case "windows":
		defaultOSDevice = "auto"
	}

	// superfast or ultrafast would produce heavy files, so opt for "fast" by default.
	// vaapi does not have any presets so this flag is unused for vaapi hwaccel.
	preset := opts.Preset

	switch name {
	case "disabled":
		return HwAccelSettings{
			Name:        "disabled",
			DecodeFlags: []string{},
			EncodeFlags: []string{
				"-c:v", "libx264",
				"-preset", preset,
				// sc_threshold is a scene detection mechanism used to create a keyframe when the scene changes
				// this is on by default and inserts keyframes where we don't want to (it also breaks force_key_frames)
				// we disable it to prevents whole scenes from being removed due to the -f segment failing to find the corresponding keyframe
				"-sc_threshold", "0",
				// force 8bits output (by default it keeps the same as the source but 10bits is not playable on some devices)
				"-pix_fmt", "yuv420p",
			},
			// we could put :force_original_aspect_ratio=decrease:force_divisible_by=2 here but we already calculate a correct width and
			// aspect ratio in our code so there is no need.
			ScaleFilter:   "scale=%d:%d",
			WithForcedIdr: true,
		}
	case "vaapi":
		return HwAccelSettings{
			Name: name,
			DecodeFlags: []string{
				"-hwaccel", "vaapi",
				"-hwaccel_device", GetEnvOr("SEANIME_TRANSCODER_VAAPI_RENDERER", defaultOSDevice),
				"-hwaccel_output_format", "vaapi",
			},
			EncodeFlags: []string{
				// h264_vaapi does not have any preset or scenecut flags.
				"-c:v", "h264_vaapi",
			},
			// if the hardware decoder could not work and fallback to soft decode, we need to instruct ffmpeg to
			// upload back frames to gpu space (after converting them)
			// see https://trac.ffmpeg.org/wiki/Hardware/VAAPI#Encoding for more info
			// we also need to force the format to be nv12 since 10bits is not supported via hwaccel.
			// this filter is equivalent to this pseudocode:
			// if (vaapi) {
			//   hwupload, passthrough, keep vaapi as is
			//   convert whatever to nv12 on GPU
			// } else {
			//   convert whatever to nv12 on CPU
			//   hwupload to vaapi(nv12)
			//   convert whatever to nv12 on GPU // scale_vaapi doesn't support passthrough option, so it has to make a copy
			// }
			// See https://www.reddit.com/r/ffmpeg/comments/1bqn60w/hardware_accelerated_decoding_without_hwdownload/ for more info
			ScaleFilter:   "format=nv12|vaapi,hwupload,scale_vaapi=%d:%d:format=nv12",
			WithForcedIdr: true,
		}
	case "qsv", "intel", "qsv-low-power", "qsv-lp", "intel-low-power", "intel-lp":
		lowPower := name == "qsv-low-power" || name == "qsv-lp" || name == "intel-low-power" || name == "intel-lp"
		encodeFlags := []string{
			"-c:v", "h264_qsv",
			"-preset", preset,
		}
		if lowPower {
			encodeFlags = []string{
				"-c:v", "h264_qsv",
				"-low_power", "1",
				"-preset", preset,
				"-bf", "0",
			}
			name = "qsv-low-power"
		}
		return HwAccelSettings{
			Name: name,
			DecodeFlags: []string{
				"-hwaccel", "qsv",
				"-qsv_device", GetEnvOr("SEANIME_TRANSCODER_QSV_RENDERER", defaultOSDevice),
				"-hwaccel_output_format", "qsv",
			},
			EncodeFlags: encodeFlags,
			// see note on ScaleFilter of the vaapi HwAccel, this is the same filter but adapted to qsv
			ScaleFilter:   "format=nv12|qsv,hwupload,scale_qsv=%d:%d:format=nv12",
			WithForcedIdr: true,
		}
	case "nvidia":
		// Frames stay on the GPU from the decoder to the encoder: decoded into CUDA memory, scaled
		// there with scale_cuda (which also brings 10-bit down to 8-bit nv12) and handed to NVENC.
		// "format=nv12|cuda,hwupload" passes CUDA frames through, and uploads the frames of anything
		// the GPU could not decode itself, which ffmpeg then decodes on the CPU instead.
		// If this pipeline fails, the first fallback (CPUFrames) is the older one: GPU decode, frames
		// copied back and scaled on the CPU.
		cpuFrames := nvidiaCPUScaleSettings(preset)
		return HwAccelSettings{
			Name: "nvidia",
			DecodeFlags: []string{
				"-init_hw_device", "cuda=cu",
				"-filter_hw_device", "cu",
				"-hwaccel", "cuda",
				"-hwaccel_device", "cu",
				"-hwaccel_output_format", "cuda",
			},
			EncodeFlags: []string{
				"-c:v", "h264_nvenc",
				"-preset", preset,
				// the equivalent of -sc_threshold on nvidia.
				"-no-scenecut", "1",
				// no -pix_fmt: the frames are CUDA frames, scale_cuda's format=nv12 makes them 8-bit.
			},
			ScaleFilter:   "format=nv12|cuda,hwupload,scale_cuda=%d:%d:format=nv12",
			WithForcedIdr: true,
			CPUFrames:     &cpuFrames,
		}
	case "nvidia-decode":
		// NVDEC decode on GPU, libx264 encode on CPU.
		// Best for cards with strong decode but weak/incompatible encode (e.g. GTX 980).
		return HwAccelSettings{
			Name: "nvidia-decode",
			DecodeFlags: []string{
				"-hwaccel", "cuda",
				// Do NOT use -hwaccel_output_format cuda here;
				// output needs to stay in CPU memory for libx264 encoding.
			},
			EncodeFlags: []string{
				"-c:v", "libx264",
				"-preset", preset,
				"-sc_threshold", "0",
			},
			ScaleFilter:   "scale=%d:%d",
			WithForcedIdr: true,
		}
	case "videotoolbox":
		return HwAccelSettings{
			Name: "videotoolbox",
			DecodeFlags: []string{
				"-hwaccel", "videotoolbox",
			},
			EncodeFlags: []string{
				"-c:v", "h264_videotoolbox",
				"-profile:v", "main",
			},
			ScaleFilter:   "scale=%d:%d",
			WithForcedIdr: true,
		}
	case "custom":
		return customHwAccelSettings
	default:
		streamLogger.Warn().Msgf("transcoder: No hardware accelerator named %q, using the CPU", name)
		return GetHardwareAccelSettings(HwAccelOptions{Kind: softwareHwAccelName, Preset: preset, FfmpegPath: opts.FfmpegPath, Role: role})
	}
}

// nvidiaCPUScaleSettings decodes on the GPU and scales and converts on the CPU before NVENC. Slower
// than keeping the frames on the GPU, but it takes -pix_fmt and works with any ffmpeg filter build.
func nvidiaCPUScaleSettings(preset string) HwAccelSettings {
	return HwAccelSettings{
		Name: "nvidia",
		DecodeFlags: []string{
			"-hwaccel", "cuda",
		},
		EncodeFlags: []string{
			"-c:v", "h264_nvenc",
			"-preset", preset,
			"-no-scenecut", "1",
			// Force 8-bit output — older GPUs (e.g. GTX 980 / Maxwell) don't support 10-bit NVENC.
			"-pix_fmt", "yuv420p",
		},
		ScaleFilter:   "scale=%d:%d",
		WithForcedIdr: true,
	}
}

// usesNvidiaDecoder reports whether these settings decode with NVDEC.
func usesNvidiaDecoder(hw HwAccelSettings) bool {
	return slices.Contains(hw.DecodeFlags, "cuda")
}

// cuvidDecoderFlags picks the NVDEC decoder itself (h264_cuvid...) for a source codec the ffmpeg build
// has no regular decoder for: "-hwaccel cuda" attaches to the regular decoder, so without one the
// stream cannot be opened at all. Builds like Fedora's ship cuvid decoders but no h264 or hevc.
func cuvidDecoderFlags(hw HwAccelSettings, sourceCodec string, decoders map[string]bool) []string {
	if decoders == nil || sourceCodec == "" || !usesNvidiaDecoder(hw) || decoders[sourceCodec] {
		return nil
	}
	if cuvid := sourceCodec + "_cuvid"; decoders[cuvid] {
		return []string{"-c:v", cuvid}
	}
	return nil
}

// isSoftwareEncode reports whether these settings encode the video on the CPU.
func isSoftwareEncode(hw HwAccelSettings) bool {
	for i, flag := range hw.EncodeFlags {
		if flag == "-c:v" && i+1 < len(hw.EncodeFlags) {
			return strings.HasPrefix(hw.EncodeFlags[i+1], "libx26")
		}
	}
	return hw.Name == softwareHwAccelName
}

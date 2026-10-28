package transcoder

import (
	"bufio"
	"context"
	"errors"
	"path/filepath"
	"seanime/internal/mediastream/videofile"
	"seanime/internal/util"
	"seanime/internal/util/result"
	"strconv"
	"strings"
	"sync"

	"github.com/rs/zerolog"
)

type Keyframe struct {
	Sha       string
	Keyframes []float64
	IsDone    bool
	info      *KeyframeInfo
}
type KeyframeInfo struct {
	mutex     sync.RWMutex
	ready     sync.WaitGroup
	readyOnce sync.Once
	err       error
	nextId    int
	listeners map[int]func(keyframes []float64)
}

// markReady releases everyone waiting in GetKeyframes. It is safe to call more than once: the scan
// calls it after its first batch and again, deferred, however it ends, so a failed scan can't
// leave later callers waiting forever.
func (kf *Keyframe) markReady() {
	kf.info.readyOnce.Do(kf.info.ready.Done)
}

// Err returns why the keyframe scan failed, if it did.
func (kf *Keyframe) Err() error {
	kf.info.mutex.RLock()
	defer kf.info.mutex.RUnlock()
	return kf.info.err
}

func (kf *Keyframe) Get(idx int32) float64 {
	kf.info.mutex.RLock()
	defer kf.info.mutex.RUnlock()
	return kf.Keyframes[idx]
}

func (kf *Keyframe) Slice(start int32, end int32) []float64 {
	if end <= start {
		return []float64{}
	}
	kf.info.mutex.RLock()
	defer kf.info.mutex.RUnlock()
	ref := kf.Keyframes[start:end]
	ret := make([]float64, end-start)
	copy(ret, ref)
	return ret
}

func (kf *Keyframe) Length() (int32, bool) {
	kf.info.mutex.RLock()
	defer kf.info.mutex.RUnlock()
	return int32(len(kf.Keyframes)), kf.IsDone
}

func (kf *Keyframe) add(values []float64) {
	kf.info.mutex.Lock()
	kf.Keyframes = append(kf.Keyframes, values...)
	snapshot := make([]float64, len(kf.Keyframes))
	copy(snapshot, kf.Keyframes)
	listeners := make([]func([]float64), 0, len(kf.info.listeners))
	for _, listener := range kf.info.listeners {
		listeners = append(listeners, listener)
	}
	kf.info.mutex.Unlock()
	// Listeners run outside the lock: a stream's listener takes the stream's segment lock, and
	// GetSegment holds that lock while reading keyframes, so calling them under this lock could
	// deadlock the two.
	for _, listener := range listeners {
		listener(snapshot)
	}
}

// AddListener registers a callback run each time keyframes are added, and returns the id to pass
// to RemoveListener.
func (kf *Keyframe) AddListener(callback func(keyframes []float64)) int {
	kf.info.mutex.Lock()
	defer kf.info.mutex.Unlock()
	if kf.info.listeners == nil {
		kf.info.listeners = make(map[int]func([]float64))
	}
	id := kf.info.nextId
	kf.info.nextId++
	kf.info.listeners[id] = callback
	return id
}

// RemoveListener drops a callback added with AddListener. Keyframes outlive the streams that
// listen to them (they're cached per file), so a stream going away must remove its listener.
func (kf *Keyframe) RemoveListener(id int) {
	kf.info.mutex.Lock()
	defer kf.info.mutex.Unlock()
	delete(kf.info.listeners, id)
}

func (kf *Keyframe) setDone(err error) {
	kf.info.mutex.Lock()
	defer kf.info.mutex.Unlock()
	kf.info.err = err
	if err == nil {
		kf.IsDone = true
	}
	// Nothing is added after this, so the listeners have nothing more to hear.
	kf.info.listeners = nil
}

var keyframes = result.NewMap[string, *Keyframe]()

// GetKeyframes returns the keyframes of the file, scanning them on first use. It returns once the
// first batch is known (or the scan has failed: check Err). ctx stops the scan; a scan that fails or
// is stopped is forgotten so the next caller starts a new one.
func GetKeyframes(
	ctx context.Context,
	path string,
	hash string,
	logger *zerolog.Logger,
	settings *Settings,
) *Keyframe {
	ret, _ := keyframes.GetOrSet(hash, func() (*Keyframe, error) {
		kf := &Keyframe{
			Sha:    hash,
			IsDone: false,
			info:   &KeyframeInfo{},
		}
		kf.info.ready.Add(1)
		go func() {
			defer kf.markReady()
			keyframesPath := filepath.Join(settings.StreamDir, hash, "keyframes.json")
			if err := getSavedInfo(keyframesPath, kf); err == nil {
				logger.Trace().Msgf("transcoder: Keyframes Cache HIT")
				kf.setDone(nil)
				return
			}

			err := getKeyframes(ctx, settings.FfprobePath, path, kf, hash, logger)
			kf.setDone(err)
			if err != nil {
				logger.Error().Err(err).Str("path", path).Msg("transcoder: Keyframe scan failed")
				if cur, ok := keyframes.Get(hash); ok && cur == kf {
					keyframes.Delete(hash)
				}
				return
			}
			_ = saveInfo(keyframesPath, kf)
		}()
		return kf, nil
	})
	ret.info.ready.Wait()
	return ret
}

func getKeyframes(ctx context.Context, ffprobePath string, path string, kf *Keyframe, hash string, logger *zerolog.Logger) error {
	if ffprobePath == "" {
		ffprobePath = "ffprobe"
	}
	defer printExecTime(logger, "ffprobe analysis for %s", path)()
	// Execute ffprobe to retrieve all IFrames. IFrames are specific points in the video we can divide it into segments.
	// We instruct ffprobe to return the timestamp and flags of each frame.
	// Although it's possible to request ffprobe to return only i-frames (keyframes) using the -skip_frame nokey option, this approach is highly inefficient.
	// The inefficiency arises because when this option is used, ffmpeg processes every single frame, which significantly slows down the operation.
	cmd := util.NewCmdCtx(
		ctx,
		ffprobePath,
		"-loglevel", "error",
		"-select_streams", "v:0",
		"-show_entries", "packet=pts_time,flags",
		"-of", "csv=print_section=0",
		path,
	)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	err = cmd.Start()
	if err != nil {
		return err
	}

	scanner := bufio.NewScanner(stdout)

	ret := make([]float64, 0, 1000)
	max := 100
	done := 0
	stoppedEarly := false
	for scanner.Scan() {
		frame := scanner.Text()
		if frame == "" {
			continue
		}

		x := strings.Split(frame, ",")
		if len(x) < 2 {
			continue
		}
		pts, flags := x[0], x[1]

		// if no video track
		if pts == "N/A" {
			stoppedEarly = true
			break
		}

		// Only take keyframes
		if len(flags) == 0 || flags[0] != 'K' {
			continue
		}

		fpts, err := strconv.ParseFloat(pts, 64)
		if err != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
			return err
		}

		// Previously, the aim was to save only those keyframes that had a minimum gap of 3 seconds between them.
		// This was to avoid creating segments as short as 0.2 seconds.
		// However, there were instances where the -f segment muxer would ignore the specified segment time and choose a random keyframe to cut at.
		// To counter this, treat every keyframe as a potential segment.
		//if done == 0 && len(ret) == 0 {
		//
		//	// There are instances where videos may not start exactly at 0:00. This needs to be considered,
		//	// and we should only include keyframes that occur after the video's start time. If not done so,
		//	// it can lead to a discrepancy in our segment count and potentially duplicate the same segment in the stream.
		//
		//	// For simplicity in code comprehension, we designate 0 as the initial keyframe, even though it's not genuine.
		//	// This value is never actually passed to ffmpeg.
		//	ret = append(ret, 0)
		//	continue
		//}
		ret = append(ret, fpts)

		if len(ret) == max {
			kf.add(ret)
			if done == 0 {
				kf.markReady()
			} else if done >= 500 {
				max = 500
			}
			done += max
			// clear the array without reallocing it
			ret = ret[:0]
		}
	}

	// Reap ffprobe; a killed or failed scan must not pass for a finished one. When we stopped
	// reading early ffprobe may be blocked writing to the pipe, so stop it first.
	if stoppedEarly {
		_ = cmd.Process.Kill()
	}
	waitErr := cmd.Wait()
	if stoppedEarly {
		waitErr = nil
	}
	if ctxErr := ctx.Err(); ctxErr != nil {
		return ctxErr
	}
	if scanErr := scanner.Err(); scanErr != nil {
		return scanErr
	}
	if waitErr != nil && done == 0 && len(ret) == 0 {
		return errors.Join(errors.New("ffprobe keyframe scan failed"), waitErr)
	}

	// If there is less than 2 (i.e. equals 0 or 1 (it happens for audio files with poster))
	if len(ret) < 2 && done == 0 {
		dummy, err := getDummyKeyframes(ffprobePath, path, hash)
		if err != nil {
			return err
		}
		ret = dummy
	}

	kf.add(ret)
	kf.markReady()
	return nil
}

func getDummyKeyframes(ffprobePath string, path string, sha string) ([]float64, error) {
	dummyKeyframeDuration := float64(2)
	info, err := videofile.FfprobeGetInfo(ffprobePath, path, sha)
	if err != nil {
		return nil, err
	}
	segmentCount := int((float64(info.Duration) / dummyKeyframeDuration) + 1)
	ret := make([]float64, segmentCount)
	for segmentIndex := 0; segmentIndex < segmentCount; segmentIndex += 1 {
		ret[segmentIndex] = float64(segmentIndex) * dummyKeyframeDuration
	}
	return ret, nil
}

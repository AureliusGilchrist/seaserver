package onlinestream_download

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
)

const maxPlaylistSize = 16 << 20

var attrRe = regexp.MustCompile(`([A-Z0-9-]+)=("[^"]*"|[^,]*)`)

func parseAttrs(s string) map[string]string {
	out := make(map[string]string)
	for _, m := range attrRe.FindAllStringSubmatch(s, -1) {
		out[m[1]] = strings.Trim(m[2], `"`)
	}
	return out
}

func resolveURL(base *url.URL, ref string) string {
	u, err := url.Parse(strings.TrimSpace(ref))
	if err != nil {
		return ref
	}
	return base.ResolveReference(u).String()
}

type hlsVariant struct {
	URL        string
	Bandwidth  int
	Height     int
	AudioGroup string
}

type hlsRendition struct {
	URL      string
	Language string
	Name     string
	Default  bool
}

type hlsMaster struct {
	Variants []*hlsVariant
	Audio    map[string][]*hlsRendition
}

func isMasterPlaylist(body []byte) bool {
	return bytes.Contains(body, []byte("#EXT-X-STREAM-INF"))
}

func parseMaster(body []byte, base *url.URL) *hlsMaster {
	m := &hlsMaster{Audio: make(map[string][]*hlsRendition)}
	sc := bufio.NewScanner(bytes.NewReader(body))
	sc.Buffer(make([]byte, 1024*1024), 1024*1024)
	var pending *hlsVariant
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		switch {
		case strings.HasPrefix(line, "#EXT-X-STREAM-INF:"):
			a := parseAttrs(strings.TrimPrefix(line, "#EXT-X-STREAM-INF:"))
			v := &hlsVariant{AudioGroup: a["AUDIO"]}
			v.Bandwidth, _ = strconv.Atoi(a["BANDWIDTH"])
			if res := a["RESOLUTION"]; res != "" {
				if parts := strings.Split(strings.ToLower(res), "x"); len(parts) == 2 {
					v.Height, _ = strconv.Atoi(parts[1])
				}
			}
			pending = v
		case strings.HasPrefix(line, "#EXT-X-MEDIA:"):
			a := parseAttrs(strings.TrimPrefix(line, "#EXT-X-MEDIA:"))
			if a["TYPE"] == "AUDIO" && a["URI"] != "" {
				m.Audio[a["GROUP-ID"]] = append(m.Audio[a["GROUP-ID"]], &hlsRendition{
					URL:      resolveURL(base, a["URI"]),
					Language: a["LANGUAGE"],
					Name:     a["NAME"],
					Default:  a["DEFAULT"] == "YES",
				})
			}
		case line == "" || strings.HasPrefix(line, "#"):
		default:
			if pending != nil {
				pending.URL = resolveURL(base, line)
				m.Variants = append(m.Variants, pending)
				pending = nil
			}
		}
	}
	return m
}

var qualityHeightRe = regexp.MustCompile(`(\d{3,4})p`)

// pickVariant takes the variant matching quality ("1080p") when one is given, and otherwise the
// best one available. Downloads pass no quality, so they always get the best.
func pickVariant(variants []*hlsVariant, quality string) *hlsVariant {
	if len(variants) == 0 {
		return nil
	}
	sorted := append([]*hlsVariant(nil), variants...)
	sort.SliceStable(sorted, func(i, j int) bool {
		if sorted[i].Height != sorted[j].Height {
			return sorted[i].Height > sorted[j].Height
		}
		return sorted[i].Bandwidth > sorted[j].Bandwidth
	})
	if m := qualityHeightRe.FindStringSubmatch(quality); m != nil {
		want, _ := strconv.Atoi(m[1])
		for _, v := range sorted {
			if v.Height == want {
				return v
			}
		}
	}
	return sorted[0]
}

// localPlaylist is a media playlist rewritten to point at files downloaded into a directory.
type localPlaylist struct {
	Path string
	// Duration is the sum of the segment durations, in seconds.
	Duration float64
}

type hlsResource struct {
	URL       string
	LocalName string
	RangeLen  int64 // -1 for whole resource
	RangeOff  int64
	// FixTS strips a disguise header in front of the first MPEG-TS sync byte. Only set for
	// unencrypted TS segments.
	FixTS bool
}

type progressFn func(done, total int, bytes int64)

// downloadMediaPlaylist fetches a media playlist and everything it references into dir, and
// writes a playlist there that ffmpeg can read from disk. prefix keeps the files of several
// playlists (video and a separate audio rendition) apart in the same directory.
func (d *downloader) downloadMediaPlaylist(ctx context.Context, playlistURL string, dir string, prefix string, onProgress progressFn) (*localPlaylist, error) {
	body, err := d.client.GetBytes(ctx, d.provider, playlistURL, d.headers, maxPlaylistSize)
	if err != nil {
		return nil, fmt.Errorf("fetch playlist: %w", err)
	}
	base, err := url.Parse(playlistURL)
	if err != nil {
		return nil, err
	}

	var (
		out       strings.Builder
		resources []*hlsResource
		keys      = make(map[string]string) // key URL -> local name
		segIdx    int
		keyMethod = "NONE"
		hasMap    bool
		// pending byte range for the next segment line
		pendingRange       = false
		rangeLen, rangeOff int64
		lastRangeEnd       = make(map[string]int64)
		duration           float64
	)

	parseRange := func(spec string, uri string) (int64, int64) {
		parts := strings.SplitN(spec, "@", 2)
		n, _ := strconv.ParseInt(strings.TrimSpace(parts[0]), 10, 64)
		var off int64
		if len(parts) == 2 {
			off, _ = strconv.ParseInt(strings.TrimSpace(parts[1]), 10, 64)
		} else {
			off = lastRangeEnd[uri]
		}
		return n, off
	}

	sc := bufio.NewScanner(bytes.NewReader(body))
	sc.Buffer(make([]byte, 1024*1024), 1024*1024)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		switch {
		case line == "":
			continue
		case strings.HasPrefix(line, "#EXT-X-KEY:"):
			a := parseAttrs(strings.TrimPrefix(line, "#EXT-X-KEY:"))
			keyMethod = strings.ToUpper(a["METHOD"])
			switch keyMethod {
			case "NONE":
				out.WriteString(line + "\n")
			case "AES-128":
				keyURL := resolveURL(base, a["URI"])
				name, ok := keys[keyURL]
				if !ok {
					name = fmt.Sprintf("%skey%d.key", prefix, len(keys))
					keyBytes, err := d.client.GetBytes(ctx, d.provider, keyURL, d.headers, 1024)
					if err != nil {
						return nil, fmt.Errorf("fetch decryption key: %w", err)
					}
					if err := os.WriteFile(filepath.Join(dir, name), keyBytes, 0o644); err != nil {
						return nil, err
					}
					keys[keyURL] = name
				}
				line = fmt.Sprintf("#EXT-X-KEY:METHOD=AES-128,URI=\"%s\"", name)
				if iv := a["IV"]; iv != "" {
					line += ",IV=" + iv
				}
				out.WriteString(line + "\n")
			default:
				return nil, fmt.Errorf("this stream is DRM-protected (%s) and cannot be downloaded", keyMethod)
			}
		case strings.HasPrefix(line, "#EXT-X-MAP:"):
			a := parseAttrs(strings.TrimPrefix(line, "#EXT-X-MAP:"))
			hasMap = true
			mapURL := resolveURL(base, a["URI"])
			name := fmt.Sprintf("%sinit%d.mp4", prefix, len(resources))
			res := &hlsResource{URL: mapURL, LocalName: name, RangeLen: -1}
			if br := a["BYTERANGE"]; br != "" {
				res.RangeLen, res.RangeOff = parseRange(br, mapURL)
				lastRangeEnd[mapURL] = res.RangeOff + res.RangeLen
			}
			resources = append(resources, res)
			out.WriteString(fmt.Sprintf("#EXT-X-MAP:URI=\"%s\"\n", name))
		case strings.HasPrefix(line, "#EXT-X-BYTERANGE:"):
			// The range is resolved once the segment URI is known; each range becomes a whole
			// local file, so the tag itself is dropped from the local playlist.
			pendingRange = true
			spec := strings.TrimPrefix(line, "#EXT-X-BYTERANGE:")
			parts := strings.SplitN(spec, "@", 2)
			rangeLen, _ = strconv.ParseInt(strings.TrimSpace(parts[0]), 10, 64)
			rangeOff = -1 // continue from the previous range of the same URI
			if len(parts) == 2 {
				rangeOff, _ = strconv.ParseInt(strings.TrimSpace(parts[1]), 10, 64)
			}
		case strings.HasPrefix(line, "#EXTINF:"):
			spec := strings.SplitN(strings.TrimPrefix(line, "#EXTINF:"), ",", 2)[0]
			if v, err := strconv.ParseFloat(strings.TrimSpace(spec), 64); err == nil {
				duration += v
			}
			out.WriteString(line + "\n")
		case strings.HasPrefix(line, "#"):
			out.WriteString(line + "\n")
		default:
			segURL := resolveURL(base, line)
			ext := ".ts"
			if hasMap {
				ext = ".m4s"
			}
			name := fmt.Sprintf("%sseg%05d%s", prefix, segIdx, ext)
			segIdx++
			res := &hlsResource{URL: segURL, LocalName: name, RangeLen: -1, FixTS: !hasMap && keyMethod == "NONE"}
			if pendingRange {
				off := rangeOff
				if off < 0 {
					off = lastRangeEnd[segURL]
				}
				res.RangeLen, res.RangeOff = rangeLen, off
				lastRangeEnd[segURL] = off + rangeLen
				pendingRange = false
			}
			resources = append(resources, res)
			out.WriteString(name + "\n")
		}
	}

	if segIdx == 0 {
		return nil, errors.New("the stream playlist lists no segments")
	}
	if !strings.Contains(out.String(), "#EXT-X-ENDLIST") {
		out.WriteString("#EXT-X-ENDLIST\n")
	}

	// Segments are named by position, so ones left by an earlier attempt are only reusable when
	// they came from the same playlist. Anything else is cleared before downloading.
	marker := filepath.Join(dir, prefix+"source.txt")
	signature := fmt.Sprintf("%s|%d", stripQuery(playlistURL), len(resources))
	if prev, err := os.ReadFile(marker); err != nil || string(prev) != signature {
		if entries, err := os.ReadDir(dir); err == nil {
			for _, e := range entries {
				if strings.HasPrefix(e.Name(), prefix) && !strings.HasSuffix(e.Name(), ".key") {
					_ = os.Remove(filepath.Join(dir, e.Name()))
				}
			}
		}
		_ = os.WriteFile(marker, []byte(signature), 0o644)
	}

	if err := d.fetchResources(ctx, resources, dir, onProgress); err != nil {
		return nil, err
	}

	path := filepath.Join(dir, prefix+"index.m3u8")
	if err := os.WriteFile(path, []byte(out.String()), 0o644); err != nil {
		return nil, err
	}
	return &localPlaylist{Path: path, Duration: duration}, nil
}

func stripQuery(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	u.RawQuery, u.Fragment = "", ""
	return u.String()
}

// fetchResources downloads the resources with a small worker pool. Every request still goes
// through the per-host limiter, so the pool size only bounds how many are queued at once.
func (d *downloader) fetchResources(ctx context.Context, resources []*hlsResource, dir string, onProgress progressFn) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	var (
		done     atomic.Int64
		bytesAll atomic.Int64
		firstErr error
		errOnce  sync.Once
		wg       sync.WaitGroup
		jobs     = make(chan *hlsResource)
	)
	total := len(resources)

	worker := func() {
		defer wg.Done()
		for res := range jobs {
			n, err := d.fetchResource(ctx, res, dir)
			if err != nil {
				errOnce.Do(func() {
					firstErr = fmt.Errorf("download %s: %w", res.LocalName, err)
					cancel()
				})
				continue
			}
			bytesAll.Add(n)
			c := done.Add(1)
			if onProgress != nil {
				onProgress(int(c), total, bytesAll.Load())
			}
		}
	}

	for i := 0; i < hostConcurrency; i++ {
		wg.Add(1)
		go worker()
	}
loop:
	for _, res := range resources {
		// Skip what an earlier attempt of this job already finished.
		if st, err := os.Stat(filepath.Join(dir, res.LocalName)); err == nil && st.Size() > 0 {
			bytesAll.Add(st.Size())
			c := done.Add(1)
			if onProgress != nil {
				onProgress(int(c), total, bytesAll.Load())
			}
			continue
		}
		select {
		case jobs <- res:
		case <-ctx.Done():
			break loop
		}
	}
	close(jobs)
	wg.Wait()

	if firstErr != nil {
		return firstErr
	}
	return ctx.Err()
}

func (d *downloader) fetchResource(ctx context.Context, res *hlsResource, dir string) (int64, error) {
	headers := make(map[string]string, len(d.headers)+1)
	for k, v := range d.headers {
		headers[k] = v
	}
	if res.RangeLen >= 0 {
		headers["Range"] = fmt.Sprintf("bytes=%d-%d", res.RangeOff, res.RangeOff+res.RangeLen-1)
	}

	tmp := filepath.Join(dir, res.LocalName+".part")
	final := filepath.Join(dir, res.LocalName)
	var written int64
	err := d.client.Do(ctx, d.provider, res.URL, headers, func(resp *http.Response) error {
		f, err := os.Create(tmp)
		if err != nil {
			return &PermanentError{Err: err}
		}
		defer f.Close()
		var r io.Reader = resp.Body
		if res.FixTS {
			r, err = stripTSDisguise(resp.Body)
			if err != nil {
				return err
			}
		}
		written, err = io.Copy(f, r)
		return err
	})
	if err != nil {
		_ = os.Remove(tmp)
		return 0, err
	}
	if written == 0 {
		_ = os.Remove(tmp)
		return 0, errors.New("empty segment")
	}
	if err := os.Rename(tmp, final); err != nil {
		return 0, err
	}
	return written, nil
}

// stripTSDisguise drops bytes in front of the first MPEG-TS packet. Some providers serve segments
// as images by prepending a PNG/JPEG header; ffmpeg cannot read those, players that probe the
// stream skip it.
func stripTSDisguise(r io.Reader) (io.Reader, error) {
	const pkt = 188
	head := make([]byte, 64*1024)
	n, err := io.ReadFull(r, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return nil, err
	}
	head = head[:n]
	if n == 0 || head[0] == 0x47 {
		return io.MultiReader(bytes.NewReader(head), r), nil
	}
	for i := 0; i+2*pkt < n; i++ {
		if head[i] == 0x47 && head[i+pkt] == 0x47 && head[i+2*pkt] == 0x47 {
			return io.MultiReader(bytes.NewReader(head[i:]), r), nil
		}
	}
	return io.MultiReader(bytes.NewReader(head), r), nil
}

package extension_repo

import (
	"context"
	"encoding/json"
	"fmt"
	"seanime/internal/events"
	"seanime/internal/extension"
	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
	"seanime/internal/goja/goja_runtime"
	"seanime/internal/util"

	"github.com/rs/zerolog"
)

type GojaOnlinestreamProvider struct {
	*gojaProviderBase
}

func NewGojaOnlinestreamProvider(ext *extension.Extension, language extension.Language, logger *zerolog.Logger, runtimeManager *goja_runtime.Manager, wsEventManager events.WSEventManagerInterface) (hibikeonlinestream.Provider, *GojaOnlinestreamProvider, error) {
	base, err := initializeProviderBase(ext, language, logger, runtimeManager, wsEventManager)
	if err != nil {
		return nil, nil, err
	}

	provider := &GojaOnlinestreamProvider{
		gojaProviderBase: base,
	}
	return provider, provider, nil
}

func (g *GojaOnlinestreamProvider) GetEpisodeServers() (ret []string) {
	ret = make([]string, 0)

	result, err := g.callClassMethod(context.Background(), "getEpisodeServers")
	if err != nil {
		return
	}

	err = g.unmarshalValue(result, &ret)
	if err != nil {
		return
	}

	return
}

func (g *GojaOnlinestreamProvider) Search(opts hibikeonlinestream.SearchOptions) (ret []*hibikeonlinestream.SearchResult, err error) {
	defer util.HandlePanicInModuleWithError(g.ext.ID+".Search", &err)

	result, err := g.callClassMethod(context.Background(), "search", structToMap(opts))
	if err != nil {
		return nil, fmt.Errorf("failed to call search method: %w", err)
	}

	ret = make([]*hibikeonlinestream.SearchResult, 0)
	err = g.unmarshalValue(result, &ret)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal search results: %w", err)
	}

	return ret, nil
}

func (g *GojaOnlinestreamProvider) FindEpisodes(id string) (ret []*hibikeonlinestream.EpisodeDetails, err error) {
	defer util.HandlePanicInModuleWithError(g.ext.ID+".FindEpisodes", &err)

	result, err := g.callClassMethod(context.Background(), "findEpisodes", id)
	if err != nil {
		return nil, err
	}

	err = g.unmarshalValue(result, &ret)
	if err != nil {
		return nil, err
	}

	for _, episode := range ret {
		episode.Provider = g.ext.ID
	}

	return
}

func (g *GojaOnlinestreamProvider) FindEpisodeServer(episode *hibikeonlinestream.EpisodeDetails, server string) (ret *hibikeonlinestream.EpisodeServer, err error) {
	defer util.HandlePanicInModuleWithError(g.ext.ID+".FindEpisodeServer", &err)

	result, err := g.callClassMethod(context.Background(), "findEpisodeServer", structToMap(episode), server)
	if err != nil {
		return nil, err
	}

	// Some extensions (e.g. GojoWtf) return subtitles at the top level of the response
	// rather than per video source. Detect this pattern and inject the top-level subtitles
	// into every video source that has an empty subtitles array before unmarshaling.
	if exported := result.Export(); exported != nil {
		if rawBytes, merr := json.Marshal(exported); merr == nil {
			var rawMap map[string]interface{}
			if merr = json.Unmarshal(rawBytes, &rawMap); merr == nil {
				rawMap = injectTopLevelSubtitles(rawMap)
				if fixed, merr := json.Marshal(rawMap); merr == nil {
					if merr = json.Unmarshal(fixed, &ret); merr == nil {
						ret.Provider = g.ext.ID
						return
					}
				}
			}
		}
	}

	err = g.unmarshalValue(result, &ret)
	if err != nil {
		return nil, err
	}

	ret.Provider = g.ext.ID

	return
}

// injectTopLevelSubtitles checks whether the raw findEpisodeServer result has a top-level
// "subs" or "subtitles" array while all videoSources have empty subtitles, and if so copies
// the top-level subtitles into every videoSource.
func injectTopLevelSubtitles(raw map[string]interface{}) map[string]interface{} {
	// Look for top-level subtitle candidates under common key names
	var topLevelSubs []interface{}
	for _, key := range []string{"subs", "subtitles", "tracks"} {
		if v, ok := raw[key]; ok {
			if arr, ok := v.([]interface{}); ok && len(arr) > 0 {
				topLevelSubs = arr
				break
			}
		}
	}
	if len(topLevelSubs) == 0 {
		return raw
	}

	videoSources, ok := raw["videoSources"].([]interface{})
	if !ok || len(videoSources) == 0 {
		return raw
	}

	// Only inject if ALL video sources have no subtitles
	for _, vs := range videoSources {
		vsMap, ok := vs.(map[string]interface{})
		if !ok {
			return raw
		}
		if subs, ok := vsMap["subtitles"].([]interface{}); ok && len(subs) > 0 {
			return raw
		}
	}

	// Normalize subtitles: map common field names (url/src, lang/language) to the
	// VideoSubtitle schema expected by the Go type {id, url, language, isDefault}.
	normalized := make([]interface{}, 0, len(topLevelSubs))
	for i, entry := range topLevelSubs {
		m, ok := entry.(map[string]interface{})
		if !ok {
			continue
		}
		norm := map[string]interface{}{
			"id":        fmt.Sprintf("%d", i),
			"url":       coalesceStr(m, "url", "src"),
			"language":  coalesceStr(m, "language", "lang", "label"),
			"isDefault": i == 0,
		}
		if norm["url"] == "" {
			continue
		}
		normalized = append(normalized, norm)
	}
	if len(normalized) == 0 {
		return raw
	}

	for _, vs := range videoSources {
		vsMap := vs.(map[string]interface{})
		vsMap["subtitles"] = normalized
	}

	return raw
}

// coalesceStr returns the first non-empty string found under the given keys in m.
func coalesceStr(m map[string]interface{}, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
	}
	return ""
}

func (g *GojaOnlinestreamProvider) GetSettings() (ret hibikeonlinestream.Settings) {
	defer util.HandlePanicInModuleThen(g.ext.ID+".GetSettings", func() {
		ret = hibikeonlinestream.Settings{}
	})

	method, err := g.callClassMethod(context.Background(), "getSettings")
	if err != nil {
		return
	}

	err = g.unmarshalValue(method, &ret)
	if err != nil {
		return
	}

	return
}

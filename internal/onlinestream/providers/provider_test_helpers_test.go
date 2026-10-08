package onlinestream_providers

import (
	"os"

	"github.com/rs/zerolog"

	hibikeonlinestream "seanime/internal/extension/hibike/onlinestream"
)

// liveEnabled reports whether the live provider tests should run.
func liveEnabled() bool {
	return os.Getenv("ANIZONE_LIVE") == "1" || os.Getenv("PROVIDERS_LIVE") == "1"
}

func testLogger() *zerolog.Logger {
	logger := zerolog.New(zerolog.NewConsoleWriter()).Level(zerolog.DebugLevel)
	return &logger
}

func hibikeSearchOptions(query string) hibikeonlinestream.SearchOptions {
	return hibikeonlinestream.SearchOptions{
		Media: hibikeonlinestream.Media{
			RomajiTitle: query,
		},
		Query: query,
	}
}

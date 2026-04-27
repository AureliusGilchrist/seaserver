package handlers

import (
    "encoding/json"
    "fmt"
    "os"
    "strconv"
    "strings"
    "sync"
    "time"

    "github.com/labstack/echo/v4"
)

const animeOfflineDatabasePath = "/aeternae/Otaku/Anime/database.json"

var seasonalCache = struct {
    mu   sync.RWMutex
    data *animeOfflineDatabase
}{
    data: nil,
}

var seasonMonthMap = map[string][]int{
    "WINTER": {1, 2, 3},
    "SPRING": {4, 5, 6},
    "SUMMER": {7, 8, 9},
    "FALL":   {10, 11, 12},
}

func (h *Handler) HandleGetSeasonalTimeline(c echo.Context) error {
    monthParam := c.QueryParam("month")
    yearParam := c.QueryParam("year")

    now := time.Now()
    month := int(now.Month())
    year := now.Year()

    if parsed, err := strconv.Atoi(monthParam); err == nil && parsed >= 1 && parsed <= 12 {
        month = parsed
    }
    if parsed, err := strconv.Atoi(yearParam); err == nil && parsed >= 1900 {
        year = parsed
    }

    timeline, err := loadSeasonalItems(month, year)
    if err != nil {
        return h.RespondWithError(c, err)
    }

    return h.RespondWithData(c, timeline)
}

func loadSeasonalDatabase() (*animeOfflineDatabase, error) {
    seasonalCache.mu.RLock()
    if seasonalCache.data != nil {
        data := seasonalCache.data
        seasonalCache.mu.RUnlock()
        return data, nil
    }
    seasonalCache.mu.RUnlock()

    seasonalCache.mu.Lock()
    defer seasonalCache.mu.Unlock()

    if seasonalCache.data != nil {
        return seasonalCache.data, nil
    }

    file, err := os.Open(animeOfflineDatabasePath)
    if err != nil {
        return nil, fmt.Errorf("failed to open anime-offline-database: %w", err)
    }
    defer file.Close()

    var parsed animeOfflineDatabase
    decoder := json.NewDecoder(file)
    if err := decoder.Decode(&parsed); err != nil {
        return nil, fmt.Errorf("failed to decode anime-offline-database: %w", err)
    }

    seasonalCache.data = &parsed
    return seasonalCache.data, nil
}

func loadSeasonalItems(month, year int) ([]seasonalTimelineItem, error) {
    db, err := loadSeasonalDatabase()
    if err != nil {
        return nil, err
    }

    var items []seasonalTimelineItem
    for _, anime := range db.Data {
        if anime.AnimeSeason == nil {
            continue
        }
        if anime.AnimeSeason.Year != year {
            continue
        }

        seasonKey := strings.ToUpper(anime.AnimeSeason.Season)
        months, ok := seasonMonthMap[seasonKey]
        if !ok {
            continue
        }

        if !contains(months, month) {
            continue
        }

        // include ongoing/upcoming/finished statuses so timeline can show historical months
        item := seasonalTimelineItem{
            Title:      anime.Title,
            Season:     seasonKey,
            SeasonYear: anime.AnimeSeason.Year,
            Status:     anime.Status,
            Type:       anime.Type,
            Picture:    anime.Picture,
            Thumbnail:  anime.Thumbnail,
            Sources:    anime.Sources,
            Synonyms:   anime.Synonyms,
            Tags:       anime.Tags,
        }
        items = append(items, item)
    }

    return items, nil
}

func contains(slice []int, value int) bool {
    for _, v := range slice {
        if v == value {
            return true
        }
    }
    return false
}

type animeOfflineDatabase struct {
    Data []*animeOfflineItem `json:"data"`
}

type animeOfflineItem struct {
    Sources     []string                `json:"sources"`
    Title       string                  `json:"title"`
    Type        string                  `json:"type"`
    Episodes    int                     `json:"episodes"`
    Status      string                  `json:"status"`
    AnimeSeason *animeOfflineSeason     `json:"animeSeason"`
    Picture     string                  `json:"picture"`
    Thumbnail   string                  `json:"thumbnail"`
    Synonyms    []string                `json:"synonyms"`
    Studios     []string                `json:"studios"`
    Tags        []string                `json:"tags"`
}

type animeOfflineSeason struct {
    Season string `json:"season"`
    Year   int    `json:"year"`
}

type seasonalTimelineItem struct {
    Title      string   `json:"title"`
    Season     string   `json:"season"`
    SeasonYear int      `json:"seasonYear"`
    Status     string   `json:"status"`
    Type       string   `json:"type"`
    Picture    string   `json:"picture"`
    Thumbnail  string   `json:"thumbnail"`
    Sources    []string `json:"sources"`
    Synonyms   []string `json:"synonyms"`
    Tags       []string `json:"tags"`
}

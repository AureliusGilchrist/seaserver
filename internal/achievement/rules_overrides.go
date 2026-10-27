package achievement

// Where an achievement's wording promised something nothing can measure — AniList has no
// publishers, birthdays, weather or "known for its soundtrack" — the rule measures the nearest real
// thing, and the description says what that is. Where a tier asked for more than exists (25 genres
// when AniList has 18), the thresholds stop at what can be reached.

type defOverride struct {
	desc       string
	thresholds []int
}

var definitionOverrides = map[string]defOverride{
	"a_binge_king":             {desc: "Watch 50+ episodes across your binge days (days of 5+ episodes)"},
	"m_binge_king":             {desc: "Read 100+ chapters across your binge days (days of 20+ chapters)"},
	"a_ost_lover":              {desc: "Watch {threshold}+ music-centred anime (Music genre, bands or idols)"},
	"a_complete_catalog":       {desc: "Finish every anime you started from a studio you've watched 10+ of"},
	"a_global_anime":           {desc: "Watch anime made in {threshold}+ different countries", thresholds: []int{2, 3, 4, 5, 6, 7, 8, 9, 10, 12}},
	"a_cult_classic":           {desc: "Watch 5+ cult classics (15+ years old, well-loved, not mainstream)"},
	"m_cult_classic":           {desc: "Read 5+ cult classics (15+ years old, well-loved, not mainstream)"},
	"a_recommendation_giver":   {desc: "Have {threshold}+ different peers join watch parties you host"},
	"a_birthday_watch":         {desc: "Watch anime on the anniversary of your first day watching here"},
	"m_birthday_read":          {desc: "Read manga on the anniversary of your first day reading here"},
	"a_format_master":          {desc: "Complete {threshold}+ anime that aren't TV series (movies, OVAs, ONAs, specials…)"},
	"a_cm_watcher":             {desc: "Watch {threshold}+ commercial-length anime (about a minute)"},
	"a_pv_collector":           {desc: "Watch {threshold}+ promotional shorts (one-episode specials or ONAs under 5 minutes)"},
	"a_back_catalog":           {desc: "Watch {threshold}+ anime that had already finished airing when you started"},
	"a_perfect_attendance":     {desc: "Watch a TV anime as it airs: start within a week of the premiere, finish within a week of the finale"},
	"a_upcoming_watcher":       {desc: "Start {threshold}+ anime within 90 days of their premiere"},
	"a_long_commitment":        {desc: "Follow an anime for 6+ months while it airs"},
	"m_long_commitment":        {desc: "Follow a manga for 6+ months while it's being published"},
	"a_seasonal_clear":         {desc: "Complete every anime you started from a single season (3+ anime)"},
	"a_speed_run":              {desc: "Watch all of a one-cour (10–14 episode) series in one sitting"},
	"a_seasonal_binge":         {desc: "Watch all of a one-cour (10–14 episode) series in one day"},
	"a_clean_list":             {desc: "Have zero paused anime on your list (with 10+ completed)"},
	"m_clean_list":             {desc: "Have zero paused manga on your list (with 10+ completed)"},
	"a_no_drop":                {desc: "Complete {threshold}+ anime in a row without dropping one in between"},
	"m_no_drop":                {desc: "Complete {threshold}+ manga in a row without dropping one in between"},
	"a_midnight_premiere":      {desc: "Start a new anime right at midnight"},
	"m_midnight_start":         {desc: "Start a new manga right at midnight"},
	"a_new_genre_month":        {desc: "Try a genre you haven't watched before (after your first 20 logged episodes)"},
	"m_new_genre_month":        {desc: "Try a genre you haven't read before (after your first 20 logged chapters)"},
	"a_random_pick":            {desc: "Start watching a randomly selected anime (Play random)"},
	"m_random_pick":            {desc: "Start reading a manga within a day of adding it to Plan to Read"},
	"m_publisher_fan":          {desc: "Read {threshold}+ manga by the same original creator"},
	"m_publisher_hopper":       {desc: "Read manga from {threshold}+ different original creators"},
	"m_serialization_explorer": {desc: "Read manga from {threshold}+ different publication years"},
	"m_up_to_date":             {desc: "Keep up with an ongoing manga, reading new chapters in 4+ different weeks"},
	"m_seasonal_premier_read":  {desc: "Read a manga in the month it began publishing"},
	"m_debut_work":             {desc: "Read 3+ works by the same mangaka"},
	"m_award_winning_art":      {desc: "Read 5+ highly-rated manga (85+) with a dedicated artist"},
	"m_visual_storyteller":     {desc: "Read manga in 5+ styles (manga, novel, one-shot, long strip, full color, 4-koma)"},
	"m_colored_classic":        {desc: "Read a full-color manga from before 2000 (or a colored edition of one)"},
	"m_webcomic_fan":           {desc: "Read {threshold}+ web-origin manga (web novel adaptations or non-Japanese long strips)"},
	"m_cross_media":            {desc: "Read a manga whose TV anime and anime movie you've both watched"},
	"m_complete_portfolio":     {desc: "Complete every manga on your list by an author you've read 5+ works from"},
	"m_author_complete":        {desc: "Complete every manga on your list by one mangaka (3+ works)"},
	"m_format_master_manga":    {desc: "Read manga in {threshold}+ different formats, styles or countries"},
	"m_reread_rerate":          {desc: "Change the score of a manga you've reread"},

	// Thresholds capped to what exists.
	"a_genre_explorer":        {thresholds: []int{3, 5, 7, 9, 11, 12, 13, 14, 16, 18}},
	"m_genre_explorer":        {thresholds: []int{3, 5, 7, 9, 11, 12, 13, 14, 16, 18}},
	"a_complete_genre_span":   {thresholds: []int{3, 5, 7, 9, 11, 12, 13, 14, 16, 18}},
	"m_complete_genre_span":   {thresholds: []int{3, 5, 7, 9, 11, 12, 13, 14, 16, 18}},
	"a_every_holiday":         {thresholds: []int{3, 5, 7, 9, 11, 13, 15, 17, 19, 21}},
	"m_every_holiday_reader":  {thresholds: []int{3, 5, 7, 9, 11, 13, 15, 17, 19, 21}},
	"a_holiday_watcher":       {thresholds: []int{3, 5, 7, 9, 11, 13, 15, 17, 19, 21}},
	"a_meta_category_starter": {thresholds: []int{3, 5, 7, 9, 10, 11, 12, 13, 13, 13}},
	"m_meta_category_starter": {thresholds: []int{3, 5, 7, 9, 10, 11, 12, 13, 13, 13}},
	"a_meta_diverse":          {thresholds: []int{3, 5, 7, 9, 10, 11, 12, 13, 13, 13}},
	"m_meta_diverse":          {thresholds: []int{3, 5, 7, 9, 10, 11, 12, 13, 13, 13}},
}

func applyDefinitionOverrides(defs []Definition) {
	for i := range defs {
		o, ok := definitionOverrides[defs[i].Key]
		if !ok {
			continue
		}
		if o.desc != "" {
			defs[i].Description = o.desc
		}
		if len(o.thresholds) > 0 && len(o.thresholds) == len(defs[i].TierThresholds) {
			defs[i].TierThresholds = o.thresholds
		}
	}
}

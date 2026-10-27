package achievement

// extraDefinitions are the achievements added after the rule registry: each was written together
// with its rule (rules_extra.go), so what it says is exactly what is measured. Many are hard on
// purpose — long streaks, enormous days, top-ranked catalogues — for people who have done the rest.

var extraTrig = []EvalTrigger{TriggerCollectionRefresh}

func xOne(key, name, desc string, cat Category, diff Difficulty) Definition {
	return Definition{Key: key, Name: name, Description: desc, Category: cat, MaxTier: 0, Triggers: extraTrig, Difficulty: diff}
}

func xTiers(key, name, desc string, cat Category, diff Difficulty, thresholds ...int) Definition {
	return Definition{
		Key: key, Name: name, Description: desc, Category: cat,
		MaxTier: len(thresholds), TierThresholds: thresholds, TierNames: t10[:len(thresholds)],
		Triggers: extraTrig, Difficulty: diff,
	}
}

var extraDefinitions = []Definition{
	// ── Streaks ──────────────────────────────────────────────────────────────────────────────
	xOne("a_thousand_day_streak", "Thousand Days", "Watch anime every day for 1,000 days in a row", CategoryAnimeStreaks, DifficultyExtreme),
	xOne("m_thousand_day_streak", "Thousand Days", "Read manga every day for 1,000 days in a row", CategoryMangaStreaks, DifficultyExtreme),
	xTiers("a_heavy_rotation", "Heavy Rotation", "Watch 5+ episodes a day for {threshold} days in a row", CategoryAnimeStreaks, DifficultyHard, 7, 14, 30, 60, 100),
	xTiers("m_heavy_rotation", "Heavy Rotation", "Read 25+ chapters a day for {threshold} days in a row", CategoryMangaStreaks, DifficultyHard, 7, 14, 30, 60, 100),
	xOne("a_two_year_weeks", "Two Years of Weeks", "Watch anime in 104 weeks in a row", CategoryAnimeStreaks, DifficultyExtreme),
	xOne("m_two_year_weeks", "Two Years of Weeks", "Read manga in 104 weeks in a row", CategoryMangaStreaks, DifficultyExtreme),
	xTiers("a_month_chain", "Month After Month", "Watch anime in {threshold} months in a row", CategoryAnimeStreaks, DifficultyHard, 6, 12, 24, 36, 60),
	xTiers("m_month_chain", "Month After Month", "Read manga in {threshold} months in a row", CategoryMangaStreaks, DifficultyHard, 6, 12, 24, 36, 60),
	xOne("a_long_way_home", "Long Way Home", "Come back to anime after a year or more away", CategoryAnimeStreaks, DifficultyMedium),
	xOne("m_long_way_home", "Long Way Home", "Come back to manga after a year or more away", CategoryMangaStreaks, DifficultyMedium),
	xOne("a_no_day_off", "No Day Off", "Watch 10+ episodes on every day of a calendar month", CategoryAnimeStreaks, DifficultyExtreme),
	xOne("m_no_day_off", "No Day Off", "Read 50+ chapters on every day of a calendar month", CategoryMangaStreaks, DifficultyExtreme),

	// ── Binge ────────────────────────────────────────────────────────────────────────────────
	xOne("a_fifty_in_a_day", "Fifty in a Day", "Watch 50 episodes in a single day", CategoryAnimeBinge, DifficultyExtreme),
	xOne("m_three_hundred_in_a_day", "Three Hundred in a Day", "Read 300 chapters in a single day", CategoryMangaBinge, DifficultyExtreme),
	xOne("a_thirty_straight", "Thirty Straight", "Watch 30 episodes in one sitting", CategoryAnimeBinge, DifficultyExtreme),
	xOne("m_hundred_fifty_straight", "Hundred and Fifty Straight", "Read 150 chapters in one sitting", CategoryMangaBinge, DifficultyExtreme),
	xTiers("a_big_week", "Big Week", "Watch {threshold}+ episodes in one week", CategoryAnimeBinge, DifficultyHard, 50, 100, 150, 250),
	xTiers("m_big_week", "Big Week", "Read {threshold}+ chapters in one week", CategoryMangaBinge, DifficultyHard, 250, 500, 1000, 2000),
	xTiers("a_big_month", "Big Month", "Watch {threshold}+ episodes in one calendar month", CategoryAnimeBinge, DifficultyHard, 150, 250, 400, 600),
	xTiers("m_big_month", "Big Month", "Read {threshold}+ chapters in one calendar month", CategoryMangaBinge, DifficultyHard, 1000, 2000, 3000, 5000),
	xOne("a_sunrise_to_sunset", "Sunrise to Sunset", "Watch in one unbroken sitting from 6 AM to 6 PM", CategoryAnimeBinge, DifficultyExtreme),
	xOne("m_sunrise_to_sunset", "Sunrise to Sunset", "Read in one unbroken sitting from 6 AM to 6 PM", CategoryMangaBinge, DifficultyExtreme),
	xOne("a_twenty_hour_day", "Twenty-Hour Day", "Spend 20+ hours watching anime in one day", CategoryAnimeBinge, DifficultyExtreme),
	xOne("m_sixteen_hour_day", "Sixteen-Hour Day", "Spend 16+ hours reading manga in one day", CategoryMangaBinge, DifficultyExtreme),
	xOne("a_one_show_day", "One-Show Day", "Watch 24 episodes of the same anime in one day", CategoryAnimeBinge, DifficultyHard),
	xOne("m_one_series_day", "One-Series Day", "Read 200 chapters of the same manga in one day", CategoryMangaBinge, DifficultyHard),
	xOne("a_strong_start", "Strong Start", "Watch 50 episodes in your first week here", CategoryAnimeBinge, DifficultyMedium),
	xOne("m_strong_start", "Strong Start", "Read 300 chapters in your first week here", CategoryMangaBinge, DifficultyMedium),

	// ── Completion ───────────────────────────────────────────────────────────────────────────
	xOne("a_ten_in_a_week", "Ten-Series Week", "Complete 10 anime within 7 days", CategoryAnimeCompletion, DifficultyHard),
	xOne("m_ten_in_a_week", "Ten-Series Week", "Complete 10 manga within 7 days", CategoryMangaCompletion, DifficultyHard),
	xOne("a_the_long_haul", "The Long Haul", "Complete an anime with 500+ episodes", CategoryAnimeCompletion, DifficultyExtreme),
	xOne("m_the_long_haul", "The Long Haul", "Complete a manga with 1,000+ chapters", CategoryMangaCompletion, DifficultyExtreme),
	xTiers("a_giant_slayer", "Giant Slayer", "Complete {threshold} anime with 100+ episodes", CategoryAnimeCompletion, DifficultyHard, 1, 3, 5, 10, 20),
	xTiers("m_giant_slayer", "Giant Slayer", "Complete {threshold} manga with 200+ chapters", CategoryMangaCompletion, DifficultyHard, 1, 3, 5, 10, 20),
	xOne("a_comfort_show", "Comfort Show", "Rewatch the same anime 5 times", CategoryAnimeDedication, DifficultyHard),
	xOne("m_comfort_read", "Comfort Read", "Reread the same manga 5 times", CategoryMangaDedication, DifficultyHard),
	xTiers("a_franchise_finisher", "Franchise Finisher", "Complete every entry of {threshold} anime franchises", CategoryAnimeCompletion, DifficultyHard, 1, 3, 5, 10, 25),
	xTiers("m_franchise_finisher", "Franchise Finisher", "Complete every entry of {threshold} manga franchises", CategoryMangaCompletion, DifficultyHard, 1, 3, 5, 10, 25),
	xOne("a_season_sweeper", "Season Sweeper", "Complete all of a 3+ season anime within 30 days", CategoryAnimeCompletion, DifficultyExtreme),
	xOne("m_series_sweeper", "Series Sweeper", "Complete all of a 3+ part manga series within 30 days", CategoryMangaCompletion, DifficultyExtreme),
	xOne("a_inbox_zero", "Inbox Zero", "Have nothing on Planning, with 50+ anime completed", CategoryAnimeCompletion, DifficultyHard),
	xOne("m_inbox_zero", "Inbox Zero", "Have nothing on Planning, with 50+ manga completed", CategoryMangaCompletion, DifficultyHard),
	xOne("a_nothing_left_behind", "Nothing Left Behind", "Have 200+ anime on your list and none dropped or paused", CategoryAnimeCompletion, DifficultyExtreme),
	xOne("m_nothing_left_behind", "Nothing Left Behind", "Have 200+ manga on your list and none dropped or paused", CategoryMangaCompletion, DifficultyExtreme),
	xOne("a_backlog_purge", "Backlog Purge", "Move 25 anime from Planning to Completed", CategoryAnimeCompletion, DifficultyHard),
	xOne("m_backlog_purge", "Backlog Purge", "Move 25 manga from Planning to Completed", CategoryMangaCompletion, DifficultyHard),

	// ── Discovery & taste ────────────────────────────────────────────────────────────────────
	xTiers("a_top_rated_hundred", "Hall of Fame", "Complete {threshold} of AniList's 100 highest-rated anime", CategoryAnimeDiscovery, DifficultyHard, 5, 10, 25, 50, 75, 100),
	xTiers("m_top_rated_hundred", "Hall of Fame", "Complete {threshold} of AniList's 100 highest-rated manga", CategoryMangaDiscovery, DifficultyHard, 5, 10, 25, 50, 75, 100),
	xTiers("a_most_popular_hundred", "Zeitgeist", "Complete {threshold} of AniList's 100 most popular anime", CategoryAnimeDiscovery, DifficultyHard, 5, 10, 25, 50, 75, 100),
	xTiers("m_most_popular_hundred", "Zeitgeist", "Complete {threshold} of AniList's 100 most popular manga", CategoryMangaDiscovery, DifficultyHard, 5, 10, 25, 50, 75, 100),
	xTiers("a_off_the_map", "Off the Map", "Complete {threshold} anime fewer than 1,000 people have on their lists", CategoryAnimeDiscovery, DifficultyHard, 1, 5, 10, 25, 50),
	xTiers("m_off_the_map", "Off the Map", "Complete {threshold} manga fewer than 500 people have on their lists", CategoryMangaDiscovery, DifficultyHard, 1, 5, 10, 25, 50),
	xTiers("a_well_rounded", "Well Rounded", "Complete 10+ anime in each of {threshold} genres", CategoryAnimeGenres, DifficultyHard, 3, 5, 8, 10, 12),
	xTiers("m_well_rounded", "Well Rounded", "Complete 10+ manga in each of {threshold} genres", CategoryMangaGenres, DifficultyHard, 3, 5, 8, 10, 12),
	xTiers("a_through_the_ages", "Through the Ages", "Complete anime from {threshold} different decades", CategoryAnimeDiscovery, DifficultyHard, 3, 4, 5, 6, 7),
	xTiers("m_through_the_ages", "Through the Ages", "Complete manga from {threshold} different decades", CategoryMangaDiscovery, DifficultyHard, 3, 4, 5, 6, 7),

	// ── Scoring ──────────────────────────────────────────────────────────────────────────────
	xOne("a_full_spectrum", "Full Spectrum", "Give at least one anime every score from 1 to 10", CategoryAnimeScoring, DifficultyMedium),
	xOne("m_full_spectrum", "Full Spectrum", "Give at least one manga every score from 1 to 10", CategoryMangaScoring, DifficultyMedium),
	xTiers("a_perfect_collection", "Perfect Collection", "Score {threshold} anime a 10", CategoryAnimeScoring, DifficultyHard, 25, 50, 100),
	xTiers("m_perfect_collection", "Perfect Collection", "Score {threshold} manga a 10", CategoryMangaScoring, DifficultyHard, 25, 50, 100),
	xOne("a_thousand_verdicts", "Thousand Verdicts", "Score 1,000 anime", CategoryAnimeScoring, DifficultyExtreme),
	xOne("m_thousand_verdicts", "Thousand Verdicts", "Score 1,000 manga", CategoryMangaScoring, DifficultyExtreme),
	xTiers("a_against_the_crowd", "Against the Crowd", "Score {threshold} anime 3+ points below their AniList average", CategoryAnimeScoring, DifficultyHard, 5, 10, 25),
	xTiers("m_against_the_crowd", "Against the Crowd", "Score {threshold} manga 3+ points below their AniList average", CategoryMangaScoring, DifficultyHard, 5, 10, 25),
	xTiers("a_true_believer", "True Believer", "Score {threshold} anime 3+ points above their AniList average", CategoryAnimeScoring, DifficultyHard, 5, 10, 25),
	xTiers("m_true_believer", "True Believer", "Score {threshold} manga 3+ points above their AniList average", CategoryMangaScoring, DifficultyHard, 5, 10, 25),
	xTiers("a_consensus", "Consensus", "Score {threshold} anime exactly at their AniList average", CategoryAnimeScoring, DifficultyMedium, 10, 25, 50),
	xTiers("m_consensus", "Consensus", "Score {threshold} manga exactly at their AniList average", CategoryMangaScoring, DifficultyMedium, 10, 25, 50),

	// ── Calendar ─────────────────────────────────────────────────────────────────────────────
	xTiers("a_every_date", "Every Date", "Watch anime on {threshold} different dates of the calendar (any year)", CategoryAnimeTime, DifficultyHard, 100, 200, 300, 366),
	xTiers("m_every_date", "Every Date", "Read manga on {threshold} different dates of the calendar (any year)", CategoryMangaTime, DifficultyHard, 100, 200, 300, 366),
	xOne("a_all_twelve", "All Twelve", "Watch anime in all 12 months of one year", CategoryAnimeTime, DifficultyMedium),
	xOne("m_all_twelve", "All Twelve", "Read manga in all 12 months of one year", CategoryMangaTime, DifficultyMedium),
	xTiers("a_whole_year", "Whole Year", "Watch anime on {threshold} days of one calendar year", CategoryAnimeTime, DifficultyHard, 100, 200, 300, 365),
	xTiers("m_whole_year", "Whole Year", "Read manga on {threshold} days of one calendar year", CategoryMangaTime, DifficultyHard, 100, 200, 300, 365),

	// ── Watch parties ────────────────────────────────────────────────────────────────────────
	xOne("a_packed_house", "Packed House", "Be in a watch party with 10+ people", CategoryAnimeSocial, DifficultyExtreme),
	xTiers("a_party_hours", "Party Hours", "Spend {threshold}+ hours in watch parties", CategoryAnimeSocial, DifficultyHard, 5, 25, 100, 250),
	xOne("a_chatterbox", "Chatterbox", "Be in a watch party where 100+ chat messages are sent", CategoryAnimeSocial, DifficultyMedium),

	// ── Both sides ───────────────────────────────────────────────────────────────────────────
	xOne("a_two_worlds", "Two Worlds", "Watch an anime and read its manga on the same day", CategoryAnimeSpecial, DifficultyMedium),
	xOne("a_dual_master", "Dual Master", "Watch 1,000+ episodes and read 10,000+ chapters", CategoryAnimeSpecial, DifficultyExtreme),
}

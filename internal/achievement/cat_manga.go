package achievement

// mangaDefinitions contains all 250 manga achievement definitions.
var mangaDefinitions = []Definition{

	// ═══════════════════════════════════════════════
	// MANGA MILESTONES (20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_first_chapter", Name: "First Chapter", Description: "Read your very first manga chapter", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress, TriggerCollectionRefresh}},
	{Key: "m_chapter_counter", Name: "Chapter Counter", Description: "Read {threshold}+ chapters total", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{100, 500, 1000, 2500, 5000, 8000, 16000, 40000, 120000, 420000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_chapter_titan", Name: "Chapter Titan", Description: "Read {threshold}+ chapters total", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{7500, 10000, 15000, 20000, 30000, 48000, 96000, 240000, 720000, 2520000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_reading_hours", Name: "Reading Hours", Description: "Spend {threshold}+ hours reading manga", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{50, 200, 500, 1000, 2500, 4000, 8000, 20000, 60000, 210000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_reading_time_lord", Name: "Reading Time Lord", Description: "Spend {threshold}+ hours reading manga", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{5000, 7500, 10000, 15000, 20000, 32000, 64000, 160000, 480000, 1680000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_manga_collector", Name: "Manga Collector", Description: "Have {threshold}+ manga on your list", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{25, 100, 250, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_library_legend", Name: "Library Legend", Description: "Have {threshold}+ manga on your list", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{1500, 2000, 3000, 4000, 5000, 8000, 16000, 40000, 120000, 420000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_first_complete", Name: "First Completion", Description: "Complete your first manga series", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete, TriggerCollectionRefresh}},
	{Key: "m_hundred_club", Name: "The Hundred Club", Description: "Read 100 different manga", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_first_day", Name: "Day One Reader", Description: "Read manga for the first time on Seanime", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress, TriggerCollectionRefresh}},
	{Key: "m_first_rating", Name: "First Review", Description: "Rate your first manga", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerRatingChange, TriggerCollectionRefresh}},
	{Key: "m_ten_thousand_pages", Name: "Ten Thousand Pages", Description: "Read 10,000+ estimated pages of manga", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_volume_collector", Name: "Volume Collector", Description: "Read manga totaling {threshold}+ volumes", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{50, 100, 250, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_year_explorer", Name: "Year Explorer", Description: "Read manga from {threshold}+ different years", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{5, 10, 15, 20, 30, 35, 40, 45, 50, 55}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_century_reader", Name: "Century Reader", Description: "Read 100 chapters in a single month", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_five_hundred_ch", Name: "Chapter Enthusiast", Description: "Read 500 chapters", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_thousand_ch", Name: "Chapter Addict", Description: "Read 1,000 chapters", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_reading_ten", Name: "Multi-Reader", Description: "Have 10+ manga currently reading simultaneously", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_ptr_hoarder", Name: "Plan to Read Hoarder", Description: "Have {threshold}+ manga in plan to read", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{25, 50, 100, 250, 500, 800, 1600, 4000, 12000, 42000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_dropped_honesty", Name: "Honest Reader", Description: "Drop {threshold}+ manga", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA BINGE (20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_binge_reader", Name: "Binge Reader", Description: "Read {threshold}+ chapters in a single day", Category: CategoryMangaBinge, MaxTier: 10, TierThresholds: []int{20, 50, 100, 150, 200, 250, 300, 400, 500, 750}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_marathon_reader", Name: "Marathon Reader", Description: "Complete a full manga in a single day", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_weekend_reader", Name: "Weekend Reader", Description: "Read {threshold}+ chapters on weekends (cumulative)", Category: CategoryMangaBinge, MaxTier: 10, TierThresholds: []int{50, 200, 500, 1000, 2500, 4000, 8000, 20000, 60000, 210000}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_non_stop_reading", Name: "Non-Stop Reading", Description: "Read for {threshold}+ hours continuously", Category: CategoryMangaBinge, MaxTier: 10, TierThresholds: []int{2, 4, 6, 10, 16, 20, 24, 30, 36, 48}, TierNames: t10, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "m_one_more_chapter", Name: "One More Chapter", Description: "Read {threshold}+ chapters after midnight in one session", Category: CategoryMangaBinge, MaxTier: 10, TierThresholds: []int{10, 25, 50, 75, 100, 125, 150, 200, 250, 300}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_speed_read", Name: "Speed Read", Description: "Complete a 50+ chapter manga in one day", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_double_story", Name: "Double Story", Description: "Complete 2 manga in one day", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_triple_read", Name: "Triple Read", Description: "Read 3 different manga in one day", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_five_a_day", Name: "Five-a-Day Reader", Description: "Read from 5 different manga in one day", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_chapter_chain", Name: "Chapter Chain", Description: "Read {threshold}+ chapters back to back without break", Category: CategoryMangaBinge, MaxTier: 10, TierThresholds: []int{20, 40, 60, 80, 100, 125, 150, 200, 250, 300}, TierNames: t10, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "m_volume_binge", Name: "Volume Binge", Description: "Read an entire volume (8+ chapters) in one sitting", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_power_reader", Name: "Power Reader", Description: "Read 50+ chapters in one day", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_half_day_read", Name: "Half-Day Read", Description: "Read for 6+ hours in a single day", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "m_full_day_read", Name: "Full-Day Read", Description: "Read for 12+ hours in a single day", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "m_power_weekend", Name: "Power Weekend Reader", Description: "Read {threshold}+ chapters in a single weekend", Category: CategoryMangaBinge, MaxTier: 10, TierThresholds: []int{25, 50, 100, 150, 200, 250, 300, 400, 500, 750}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_binge_king", Name: "Binge King Reader", Description: "Binge 100+ chapters total across all days", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_no_sleep_read", Name: "No Sleep Reader", Description: "Read manga from 10PM to 6AM without stopping", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "m_full_series_rush", Name: "Full Series Rush", Description: "Read all chapters of a 100+ chapter manga in under 3 days", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_seven_day_challenge", Name: "Seven Day Reading Challenge", Description: "Read manga every day for a week straight", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_hundred_day_read", Name: "Hundred-Day Read", Description: "Read manga for 100 consecutive days", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},

	// ═══════════════════════════════════════════════
	// MANGA GENRES (40 definitions — 16 genre defs × varying tiers)
	// ═══════════════════════════════════════════════

	{Key: "m_genre_action", Name: "Action Reader", Description: "Read {threshold}+ Action manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_adventure", Name: "Adventure Reader", Description: "Read {threshold}+ Adventure manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_comedy", Name: "Comedy Reader", Description: "Read {threshold}+ Comedy manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_drama", Name: "Drama Reader", Description: "Read {threshold}+ Drama manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_fantasy", Name: "Fantasy Reader", Description: "Read {threshold}+ Fantasy manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_horror", Name: "Horror Reader", Description: "Read {threshold}+ Horror manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_mystery", Name: "Mystery Reader", Description: "Read {threshold}+ Mystery manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_romance", Name: "Romance Reader", Description: "Read {threshold}+ Romance manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_scifi", Name: "Sci-Fi Reader", Description: "Read {threshold}+ Sci-Fi manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_sol", Name: "Slice of Life Reader", Description: "Read {threshold}+ Slice of Life manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_sports", Name: "Sports Reader", Description: "Read {threshold}+ Sports manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_supernatural", Name: "Supernatural Reader", Description: "Read {threshold}+ Supernatural manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_thriller", Name: "Thriller Reader", Description: "Read {threshold}+ Thriller manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_psychological", Name: "Psychological Reader", Description: "Read {threshold}+ Psychological manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_isekai", Name: "Isekai Expert", Description: "Read {threshold}+ Isekai manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_shounen", Name: "Shounen Heart", Description: "Read {threshold}+ Shounen manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA COMPLETION (20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_completionist", Name: "Completionist Reader", Description: "Complete {threshold}+ manga series", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 250, 400, 800, 2000, 6000, 21000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_mega_completionist", Name: "Mega Completionist Reader", Description: "Complete {threshold}+ manga series", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{500, 750, 1000, 1500, 2000, 3200, 6500, 16000, 48000, 170000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_completion_rate_50", Name: "Halfway Read", Description: "Achieve 50% completion rate on your manga list", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_completion_rate_75", Name: "Almost Finished", Description: "Achieve 75% completion rate on your manga list", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_completion_rate_90", Name: "Perfectionist Reader", Description: "Achieve 90% completion rate on your manga list", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_no_drop", Name: "Never Drop Reader", Description: "Complete {threshold}+ manga without dropping any", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{25, 50, 100, 200, 500, 800, 1600, 4000, 12000, 42000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_long_runner_complete", Name: "Long Runner Reader", Description: "Complete a manga with {threshold}+ chapters", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{50, 100, 200, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_sequel_chain", Name: "Series Chain", Description: "Read all parts of a {threshold}+ part manga series", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{2, 3, 4, 5, 6, 7, 8, 9, 10, 12}, TierNames: t10, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_clean_list", Name: "Clean Reading List", Description: "Have zero paused manga on your list", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_from_ptr", Name: "Plan Executed Reader", Description: "Move {threshold}+ manga from Plan to Read to Completed", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 250, 400, 800, 2000, 6000, 21000}, TierNames: t10, Triggers: []EvalTrigger{TriggerStatusChange}},
	{Key: "m_reread_master", Name: "Reread Master", Description: "Reread {threshold}+ manga", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_oneshot_complete", Name: "Oneshot", Description: "Complete {threshold}+ one-shot manga", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_same_day_start_finish", Name: "Same-Day Start & Finish Reader", Description: "Start and complete a manga on the same day", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_revival", Name: "Reading Revival", Description: "Complete a manga that was on hold for 30+ days", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_zero_to_hundred", Name: "Zero to Hundred", Description: "Go from 0 to 100 completed manga", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_five_genre_complete", Name: "Genre Sweep Reader", Description: "Complete manga in 5+ different genres in one week", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_full_collection", Name: "Collection Complete", Description: "Complete every entry in a manga series", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_batch_complete", Name: "Batch Complete Reader", Description: "Complete {threshold}+ manga in a single week", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{3, 5, 7, 10, 15, 20, 25, 30, 40, 50}, TierNames: t10, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_paused_to_done", Name: "Paused to Done Reader", Description: "Complete {threshold}+ previously paused manga", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 50, 75, 100, 150, 200, 300}, TierNames: t10, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_completion_spree", Name: "Completion Spree Reader", Description: "Complete 5 manga in 3 days", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},

	// ═══════════════════════════════════════════════
	// MANGA DEDICATION (20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_loyal_reader", Name: "Loyal Reader", Description: "Read {threshold}+ chapters of a single manga", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{50, 100, 200, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_mangaka_lover", Name: "Mangaka Lover", Description: "Read {threshold}+ manga by the same author", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{3, 5, 8, 12, 20, 25, 30, 40, 50, 75}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_rereader", Name: "Rereader", Description: "Reread a manga series", Category: CategoryMangaDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerStatusChange}},
	{Key: "m_triple_reread", Name: "Triple Reread", Description: "Reread the same manga 3 times", Category: CategoryMangaDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerStatusChange}},
	{Key: "m_annual_reread", Name: "Annual Reread", Description: "Read the same manga in two different years", Category: CategoryMangaDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_publisher_fan", Name: "Publisher Fan", Description: "Read {threshold}+ manga from the same publisher", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_artist_fan", Name: "Artist Fan", Description: "Read {threshold}+ manga by the same artist", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{3, 5, 8, 12, 20, 30, 60, 150, 450, 1600}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_adaptation_compare", Name: "Adaptation Comparer", Description: "Read manga that has an anime adaptation and watch the anime", Category: CategoryMangaDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_source_material_fan", Name: "Source Material Fan", Description: "Read {threshold}+ manga that were adapted to anime", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_waiting_weekly", Name: "Weekly Reader", Description: "Follow {threshold}+ ongoing manga simultaneously", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{3, 5, 8, 12, 20, 25, 30, 40, 50, 75}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_classic_reader", Name: "Classic Reader", Description: "Read manga originally published before 2000", Category: CategoryMangaDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_saga_reader", Name: "Saga Reader", Description: "Read 500+ chapters across a single franchise", Category: CategoryMangaDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_loyalty", Name: "Genre Loyalty Reader", Description: "Have 30%+ of your manga in a single genre", Category: CategoryMangaDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_decade_reader", Name: "Decade Reader", Description: "Read manga from {threshold}+ different decades", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{2, 3, 4, 5, 6, 7, 8, 9, 10, 10}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_ln_adaptation", Name: "Light Novel Adaptation", Description: "Read {threshold}+ manga adapted from light novels", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_original_work", Name: "Original Work Fan", Description: "Read {threshold}+ original manga works", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_long_commitment", Name: "Long Commitment Reader", Description: "Follow an ongoing manga for 6+ months", Category: CategoryMangaDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_up_to_date", Name: "Up to Date", Description: "Be caught up on an ongoing manga within a day of release", Category: CategoryMangaDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_favorite_mangaka", Name: "Favorite Mangaka", Description: "Read 5+ works by your favorite mangaka", Category: CategoryMangaDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_complete_portfolio", Name: "Complete Portfolio", Description: "Read 50%+ of a mangaka's published works", Category: CategoryMangaDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA DISCOVERY (20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_genre_explorer", Name: "Genre Explorer Reader", Description: "Read manga from {threshold}+ different genres", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 8, 10, 12, 15, 16, 18, 20, 22, 25}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_publisher_hopper", Name: "Publisher Hopper", Description: "Read manga from {threshold}+ different publishers", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_explorer", Name: "Tag Explorer Reader", Description: "Read manga with {threshold}+ different tags", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_decade_hopper", Name: "Decade Hopper Reader", Description: "Read manga from {threshold}+ different decades", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{3, 4, 5, 6, 7, 8, 9, 10, 10, 10}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_hidden_gem", Name: "Hidden Gem Reader", Description: "Read {threshold}+ manga with < 30K members on AniList", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_popular_taste", Name: "Popular Taste Reader", Description: "Read {threshold}+ of the top 100 most popular manga", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{10, 25, 40, 60, 80, 85, 90, 93, 96, 100}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_retro_reader", Name: "Retro Reader", Description: "Read {threshold}+ manga from before 2000", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_modern_reader", Name: "Modern Reader", Description: "Read {threshold}+ manga from the current year", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_cross_demographic", Name: "Cross Demographic Reader", Description: "Read manga from 3+ different demographics", Category: CategoryMangaDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_underdog_fan", Name: "Underdog Fan Reader", Description: "Rate a low-popularity manga 8 or higher", Category: CategoryMangaDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "m_variety_week", Name: "Variety Week Reader", Description: "Read 7+ different genres in one week", Category: CategoryMangaDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_manhwa_reader", Name: "Manhwa Reader", Description: "Read {threshold}+ Korean manhwa", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_manhua_reader", Name: "Manhua Reader", Description: "Read {threshold}+ Chinese manhua", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_classic_connoisseur", Name: "Classic Connoisseur Reader", Description: "Read {threshold}+ manga from the 80s and 90s", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 10, 20, 35, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_award_winner", Name: "Award Winner Reader", Description: "Read {threshold}+ highly-rated manga (score > 8.5)", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_niche_explorer", Name: "Niche Explorer Reader", Description: "Read manga in 3+ uncommon genres (Josei, Seinen, etc.)", Category: CategoryMangaDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_world_manga", Name: "World Manga", Description: "Read manga/manhwa/manhua from 3+ different countries", Category: CategoryMangaDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_cult_classic", Name: "Cult Classic Reader", Description: "Read 5+ cult classic manga", Category: CategoryMangaDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_random_pick", Name: "Random Pick Reader", Description: "Start reading a randomly selected manga", Category: CategoryMangaDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerPlatformEvent}},
	{Key: "m_new_genre_month", Name: "New Genre Monthly Reader", Description: "Try a new genre you haven't read before", Category: CategoryMangaDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA TIME (15 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_night_owl", Name: "Night Owl Reader", Description: "Read {threshold}+ chapters between midnight and 6 AM", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{50, 200, 500, 1000, 2500, 4000, 8000, 20000, 60000, 210000}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_early_bird", Name: "Early Bird Reader", Description: "Read {threshold}+ chapters between 5 AM and 9 AM", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{25, 100, 250, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_lunch_reader", Name: "Lunch Break Reader", Description: "Read {threshold}+ chapters between 11 AM and 1 PM", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{25, 100, 250, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_commute_reader", Name: "Commute Reader", Description: "Read {threshold}+ chapters between 7 AM and 9 AM or 5 PM and 7 PM", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{25, 100, 250, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_four_am_club", Name: "4 AM Reading Club", Description: "Read a chapter at 4 AM", Category: CategoryMangaTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_new_year_read", Name: "New Year's Read", Description: "Read manga on January 1st", Category: CategoryMangaTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_all_hours", Name: "All Hours Reader", Description: "Read manga in every hour of the day (24/24)", Category: CategoryMangaTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_prime_time_reader", Name: "Prime Time Reader", Description: "Read {threshold}+ chapters between 8 PM and 11 PM", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{50, 200, 500, 1000, 2500, 4000, 8000, 20000, 60000, 210000}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_workday_reader", Name: "Workday Reader", Description: "Read {threshold}+ chapters on weekdays", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{50, 200, 500, 1000, 2500, 4000, 8000, 20000, 60000, 210000}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_sunday_read", Name: "Sunday Read", Description: "Read 20+ chapters on a Sunday", Category: CategoryMangaTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_morning_routine", Name: "Morning Reading Routine", Description: "Read manga before 9 AM for 7 days straight", Category: CategoryMangaTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_night_shift_reader", Name: "Night Shift Reader", Description: "Read manga after midnight for {threshold}+ days", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{7, 14, 30, 60, 100, 150, 200, 250, 300, 365}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_seasonal_premier_read", Name: "New Release Reader", Description: "Read a newly released chapter on its publication day", Category: CategoryMangaTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_clock_collector", Name: "Clock Collector Reader", Description: "Read manga in {threshold}+ different hours (unique hours)", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{6, 12, 15, 18, 20, 21, 22, 23, 24, 24}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_late_night_horror", Name: "Late Night Horror", Description: "Read a horror manga after midnight", Category: CategoryMangaTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},

	// ═══════════════════════════════════════════════
	// MANGA CREATIVE (15 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_art_appreciator", Name: "Art Appreciator", Description: "Read manga by {threshold}+ different artists", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_webtoon_reader", Name: "Webtoon Reader", Description: "Read {threshold}+ webtoon-format manga", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_full_color", Name: "Full Color", Description: "Read {threshold}+ full-color manga/manhwa", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_doujin_reader", Name: "Doujinshi Reader", Description: "Read {threshold}+ doujinshi", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_anthology_reader", Name: "Anthology Reader", Description: "Read 5+ anthology manga", Category: CategoryMangaCreative, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_adaptation_reader", Name: "Adaptation Reader", Description: "Read {threshold}+ manga with anime adaptations", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_longstrip_reader", Name: "Long Strip Reader", Description: "Read {threshold}+ long-strip format manga", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_4koma_reader", Name: "4-Koma Reader", Description: "Read {threshold}+ 4-koma manga", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_oneshot_reader", Name: "Oneshot Reader", Description: "Read {threshold}+ oneshot manga", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_format_variety", Name: "Format Variety", Description: "Read manga in all available formats", Category: CategoryMangaCreative, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_light_novel_reader", Name: "Light Novel Reader", Description: "Read {threshold}+ light novels", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_novel_reader", Name: "Novel Reader", Description: "Read {threshold}+ novels on your manga list", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_visual_storyteller", Name: "Visual Storyteller", Description: "Read manga across 5+ different art styles", Category: CategoryMangaCreative, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_colored_classic", Name: "Colored Classic", Description: "Read a colored version of a classic manga", Category: CategoryMangaCreative, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_webcomic_fan", Name: "Webcomic Fan", Description: "Read {threshold}+ webcomic-origin manga", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA STREAKS (20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_daily_streak", Name: "Daily Reading Streak", Description: "Read manga for {threshold}+ consecutive days", Category: CategoryMangaStreaks, MaxTier: 10, TierThresholds: []int{7, 14, 30, 60, 100, 150, 200, 250, 300, 365}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_mega_streak", Name: "Mega Reading Streak", Description: "Read manga for {threshold}+ consecutive days", Category: CategoryMangaStreaks, MaxTier: 10, TierThresholds: []int{150, 200, 250, 300, 365, 400, 450, 500, 600, 730}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_weekly_warrior", Name: "Weekly Reading Warrior", Description: "Read manga every week for {threshold}+ weeks", Category: CategoryMangaStreaks, MaxTier: 10, TierThresholds: []int{4, 8, 16, 26, 52, 78, 104, 130, 156, 208}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_monthly_reader", Name: "Monthly Reader", Description: "Read manga every month for {threshold}+ months", Category: CategoryMangaStreaks, MaxTier: 10, TierThresholds: []int{3, 6, 9, 12, 24, 36, 48, 60, 84, 120}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_comeback", Name: "Reading Comeback", Description: "Resume reading after a 30+ day break", Category: CategoryMangaStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_weekend_streak", Name: "Weekend Reading Streak", Description: "Read manga every weekend for {threshold}+ weeks", Category: CategoryMangaStreaks, MaxTier: 10, TierThresholds: []int{4, 8, 12, 20, 40, 52, 78, 104, 130, 156}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_no_zero_days", Name: "No Zero Reading Days", Description: "Have no zero-reading days for a full month", Category: CategoryMangaStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_iron_will", Name: "Iron Will Reader", Description: "Maintain a 50+ day reading streak", Category: CategoryMangaStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_habit_formed", Name: "Reading Habit Formed", Description: "Read manga at the same hour for 7+ days in a row", Category: CategoryMangaStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_consistent_pace", Name: "Consistent Reading Pace", Description: "Read 5+ chapters daily for 14 consecutive days", Category: CategoryMangaStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_year_long", Name: "Year-Long Reading", Description: "Read manga every month for a full year", Category: CategoryMangaStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_double_streak", Name: "Double Streak Reader", Description: "Maintain manga AND anime streaks simultaneously for 7+ days", Category: CategoryMangaStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_streak_recovery", Name: "Reading Streak Recovery", Description: "Rebuild a 14+ day reading streak after losing one", Category: CategoryMangaStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_daily_minimum", Name: "Daily Reading Minimum", Description: "Read at least 5 chapters every day for {threshold} days", Category: CategoryMangaStreaks, MaxTier: 10, TierThresholds: []int{7, 14, 30, 60, 100, 150, 200, 250, 300, 365}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_winter_streak", Name: "Winter Reading Streak", Description: "Read manga every day in December", Category: CategoryMangaStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_summer_streak", Name: "Summer Reading Streak", Description: "Read manga every day in July", Category: CategoryMangaStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_morning_streak", Name: "Morning Reading Streak", Description: "Read manga before 9 AM for {threshold}+ consecutive days", Category: CategoryMangaStreaks, MaxTier: 10, TierThresholds: []int{3, 7, 14, 21, 30, 45, 60, 90, 120, 180}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_night_streak", Name: "Night Reading Streak", Description: "Read manga after midnight for {threshold}+ consecutive days", Category: CategoryMangaStreaks, MaxTier: 10, TierThresholds: []int{3, 7, 14, 21, 30, 45, 60, 90, 120, 180}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_unbreakable", Name: "Unbreakable Reader", Description: "Maintain a 100+ day manga reading streak", Category: CategoryMangaStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_eternal_flame", Name: "Eternal Flame Reader", Description: "Maintain a 365 day reading streak", Category: CategoryMangaStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},

	// ═══════════════════════════════════════════════
	// MANGA SCORING (15 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_critic", Name: "Manga Critic", Description: "Rate {threshold}+ manga", Category: CategoryMangaScoring, MaxTier: 10, TierThresholds: []int{25, 50, 100, 250, 500, 800, 1600, 4000, 12000, 42000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_perfect_ten", Name: "Perfect Ten Reader", Description: "Give {threshold}+ manga a score of 10", Category: CategoryMangaScoring, MaxTier: 10, TierThresholds: []int{1, 5, 10, 25, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "m_harsh_critic", Name: "Harsh Manga Critic", Description: "Give {threshold}+ manga a score of 1-3", Category: CategoryMangaScoring, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "m_fair_judge", Name: "Fair Manga Judge", Description: "Have an average manga score between 5.0 and 7.0 with 50+ ratings", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_generous_spirit", Name: "Generous Manga Spirit", Description: "Have an average manga score above 8.0 with 50+ ratings", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_score_all", Name: "Rate All Manga", Description: "Rate every manga on your completed list", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_wide_range", Name: "Wide Range Reader", Description: "Use every score from 1-10 at least once on manga", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_controversial", Name: "Controversial Reader", Description: "Rate a manga 4+ points different from its average score", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "m_consistent_scorer", Name: "Consistent Manga Scorer", Description: "Rate 20+ manga the same score", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_score_sniper", Name: "Manga Score Sniper", Description: "Rate a manga exactly at the community average (±0.1)", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "m_evolving_taste", Name: "Evolving Manga Taste", Description: "Change scores on {threshold}+ manga", Category: CategoryMangaScoring, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "m_bell_curve", Name: "Manga Bell Curve", Description: "Have a manga score distribution resembling a bell curve", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_picky_reader", Name: "Picky Reader", Description: "Have an average manga score below 5.0 with 25+ ratings", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_100_rated", Name: "Century Manga Critic", Description: "Rate 100 manga", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_500_rated", Name: "Master Manga Critic", Description: "Rate 500 manga", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA HOLIDAY (15 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_new_years_resolution", Name: "New Year's Read Resolution", Description: "Read manga on January 1st", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_valentines_read", Name: "Valentine's Reader", Description: "Read a romance manga on February 14th", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_pi_day", Name: "Pi Day Reader", Description: "Read manga on March 14th", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_april_fools", Name: "April Fool's Reader", Description: "Read a comedy manga on April 1st", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_international_manga_day", Name: "International Manga Day", Description: "Read manga on September 21st", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_free_comic_day", Name: "Free Comic Book Day", Description: "Read a manga on the first Saturday of May", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_summer_solstice", Name: "Summer Solstice Reader", Description: "Read manga on June 21st", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_tanabata", Name: "Tanabata Reader", Description: "Read a romance manga on July 7th", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_friday_13th", Name: "Friday the 13th Reader", Description: "Read a horror manga on Friday the 13th", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_halloween_read", Name: "Halloween Read", Description: "Read a horror manga on October 31st", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_thanksgiving_binge", Name: "Thanksgiving Reading Binge", Description: "Read 50+ chapters on Thanksgiving", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_christmas_read", Name: "Christmas Read", Description: "Read manga on December 25th", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_new_years_eve", Name: "New Year's Eve Read", Description: "Read manga on December 31st", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_birthday_read", Name: "Birthday Read", Description: "Read manga on your birthday", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_holiday_marathon", Name: "Holiday Reading Marathon", Description: "Read manga every day from Dec 24-31", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},

	// ═══════════════════════════════════════════════
	// MANGA SPECIAL (10 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_round_number", Name: "Round Number Reader", Description: "Complete your 100th manga", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_fibonacci", Name: "Fibonacci Reader", Description: "Completed manga count is a Fibonacci number", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_palindrome_day", Name: "Palindrome Reading Day", Description: "Complete a manga on a palindrome date", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_binary_day", Name: "Binary Reading Day", Description: "Read manga on a binary date", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_full_moon_read", Name: "Full Moon Reader", Description: "Read manga during a full moon", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_leap_year_read", Name: "Leap Year Reader", Description: "Read manga on Feb 29", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_triple_seven", Name: "Triple Seven Reader", Description: "Have exactly 777 chapters read", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_thousand_complete", Name: "One Thousand Manga", Description: "Complete your 1,000th manga", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_nice", Name: "Nice Reader", Description: "Have exactly 69 manga completed", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_power_level_chapters", Name: "Over 9000 Chapters", Description: "Read over 9,000 chapters total", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_answer_42", Name: "The Answer Reader", Description: "Have exactly 42 manga completed", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_square_number", Name: "Perfect Square Reader", Description: "Completed manga count is a perfect square (16, 25, 36...)", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_prime_count", Name: "Prime Reader", Description: "Complete a prime number (>100) of manga", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_matching_date", Name: "Matching Date Reader", Description: "Complete a manga where chapter count matches day of month", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_century_chapter", Name: "Century Chapter", Description: "Read chapter 100+ of any single manga", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_pi_chapters", Name: "Pi Chapters", Description: "Read exactly 314 chapters total", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_synchronicity", Name: "Reading Synchronicity", Description: "Read chapter N of a manga on the Nth day of the month", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_world_record", Name: "Personal Chapter Record", Description: "Set a new personal record for chapters in a single day", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_genre_clash", Name: "Genre Clash Reader", Description: "Read a horror manga and a romance manga in the same session", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_time_traveler", Name: "Time Traveler Reader", Description: "Read manga from 5+ different decades in one day", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},

	// ═══════════════════════════════════════════════
	// MANGA TIME (additional)
	// ═══════════════════════════════════════════════

	{Key: "m_afternoon_reader", Name: "Afternoon Reader", Description: "Read {threshold}+ chapters between 2 PM and 5 PM", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{25, 100, 250, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_golden_hour_reader", Name: "Golden Hour Reader", Description: "Read {threshold}+ chapters between 6 PM and 8 PM", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{25, 100, 250, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_dawn_reader", Name: "Dawn Reader", Description: "Read manga from midnight to dawn (6 AM consecutive)", Category: CategoryMangaTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "m_twilight_reader", Name: "Twilight Reader", Description: "Read manga between 3 AM and 5 AM for 3 consecutive days", Category: CategoryMangaTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_midnight_start", Name: "Midnight Start", Description: "Start a new manga exactly at midnight", Category: CategoryMangaTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},

	// ═══════════════════════════════════════════════
	// MANGA CREATIVE (additional)
	// ═══════════════════════════════════════════════

	{Key: "m_manga_to_anime", Name: "Manga to Anime", Description: "Read {threshold}+ manga whose anime you have also watched", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_seinen_reader", Name: "Seinen Reader", Description: "Read {threshold}+ Seinen manga", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_josei_reader", Name: "Josei Reader", Description: "Read {threshold}+ Josei manga", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_award_winning_art", Name: "Award-Winning Art", Description: "Read 5+ manga known for exceptional artwork", Category: CategoryMangaCreative, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_debut_work", Name: "Debut Work", Description: "Read a mangaka's very first published work", Category: CategoryMangaCreative, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA SCORING (additional)
	// ═══════════════════════════════════════════════

	{Key: "m_mediocre_majority", Name: "Mediocre Majority Reader", Description: "Have 50%+ of manga ratings between score 5-7", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_rating_spree", Name: "Rating Spree Reader", Description: "Rate {threshold}+ manga in a single day", Category: CategoryMangaScoring, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 75, 100, 150, 200, 300}, TierNames: t10, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "m_score_variance", Name: "Score Variance Reader", Description: "Have a standard deviation of 2.0+ in your manga scores", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_binge_rater", Name: "Binge Rater", Description: "Rate 50+ manga in a single week", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "m_reread_rerate", Name: "Reread & Rerate", Description: "Change a manga's score after re-reading it", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerRatingChange}},

	// ═══════════════════════════════════════════════
	// MANGA HOLIDAY (additional)
	// ═══════════════════════════════════════════════

	{Key: "m_independence_day", Name: "Independence Day Reader", Description: "Read manga on July 4th", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_culture_day", Name: "Culture Day Reader", Description: "Read manga on November 3rd (Culture Day in Japan)", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_spring_equinox", Name: "Spring Equinox Reader", Description: "Read manga on March 20th", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},

	// ═══════════════════════════════════════════════
	// MANGA GENRES (additional)
	// ═══════════════════════════════════════════════

	{Key: "m_genre_ecchi", Name: "Ecchi Reader", Description: "Read {threshold}+ Ecchi manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_mahou_shoujo", Name: "Mahou Shoujo Reader", Description: "Read {threshold}+ Mahou Shoujo manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_mecha", Name: "Mecha Reader", Description: "Read {threshold}+ Mecha manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_music", Name: "Music Manga Reader", Description: "Read {threshold}+ Music manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA DISCOVERY (additional)
	// ═══════════════════════════════════════════════

	{Key: "m_year_completionist", Name: "Year Completionist", Description: "Read {threshold}+ manga from a single publication year", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_unpopular_opinion", Name: "Unpopular Opinion Reader", Description: "Complete {threshold}+ manga with fewer than 5K members", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA DEDICATION (additional)
	// ═══════════════════════════════════════════════

	{Key: "m_franchise_collector", Name: "Franchise Collector Reader", Description: "Read entries from {threshold}+ different franchises", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_serialization_follower", Name: "Serialization Follower", Description: "Follow {threshold}+ serializing manga to completion", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerMangaComplete}},

	// ═══════════════════════════════════════════════
	// MANGA TAG GENRES (tag-based, 20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_tag_isekai_new", Name: "Isekai Traveler Reader", Description: "Read {threshold}+ Isekai manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_harem", Name: "Harem Reader", Description: "Read {threshold}+ Harem manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_bl", Name: "Boys' Love Reader", Description: "Read {threshold}+ Boys' Love manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_gl", Name: "Girls' Love Reader", Description: "Read {threshold}+ Girls' Love manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_historical", Name: "History Buff Reader", Description: "Read {threshold}+ Historical manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_military", Name: "Military Reader", Description: "Read {threshold}+ Military manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_school", Name: "School Life Reader", Description: "Read {threshold}+ School manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_martial_arts", Name: "Martial Arts Reader", Description: "Read {threshold}+ Martial Arts manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_vampire", Name: "Vampire Reader", Description: "Read {threshold}+ Vampire manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_samurai", Name: "Samurai Reader", Description: "Read {threshold}+ Samurai manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_space", Name: "Space Reader", Description: "Read {threshold}+ Space manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_parody", Name: "Parody Reader", Description: "Read {threshold}+ Parody manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_idol", Name: "Idol Manga Fan", Description: "Read {threshold}+ Idol manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_post_apocalyptic", Name: "Post-Apocalyptic Reader", Description: "Read {threshold}+ Post-Apocalyptic manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_cyberpunk", Name: "Cyberpunk Reader", Description: "Read {threshold}+ Cyberpunk manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_shoujo", Name: "Shoujo Heart Reader", Description: "Read {threshold}+ Shoujo manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_survival", Name: "Survival Reader", Description: "Read {threshold}+ Survival manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_cooking", Name: "Cooking Manga Fan", Description: "Read {threshold}+ Cooking manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_medical", Name: "Medical Reader", Description: "Read {threshold}+ Medical manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_tag_villainess", Name: "Villainess Fan", Description: "Read {threshold}+ Villainess manga", Category: CategoryMangaGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA ADDITIONAL MILESTONES (10 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_five_thousand_ch", Name: "Chapter Legend", Description: "Read 5,000 chapters total", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_ten_completed", Name: "First Ten Manga", Description: "Complete 10 manga series", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_fifty_completed", Name: "Half Century Manga", Description: "Complete 50 manga series", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_five_hundred_completed", Name: "Five Hundred Manga Club", Description: "Complete 500 manga series", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_mean_score_tracker", Name: "Mean Score Tracker Reader", Description: "Have a mean score with {threshold}+ rated manga", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{10, 50, 100, 250, 500, 800, 1600, 4000, 12000, 42000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_unique_authors", Name: "Author Counter", Description: "Read manga from {threshold}+ unique authors", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 150, 200, 250, 300, 400, 500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_all_status", Name: "Every Status Manga", Description: "Have manga in all statuses", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_first_favorite", Name: "First Favorite Manga", Description: "Add your first manga to favorites", Category: CategoryMangaMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerFavoriteToggle, TriggerCollectionRefresh}},
	{Key: "m_favorites_collector", Name: "Manga Favorites Collector", Description: "Have {threshold}+ manga in your favorites", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 75, 100, 150, 200, 300}, TierNames: t10, Triggers: []EvalTrigger{TriggerFavoriteToggle, TriggerCollectionRefresh}},
	{Key: "m_days_spent_reading", Name: "Days of Manga", Description: "Spend {threshold}+ full days reading manga", Category: CategoryMangaMilestones, MaxTier: 10, TierThresholds: []int{5, 10, 30, 60, 100, 200, 400, 800, 1500, 3000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA ADDITIONAL BINGE (8 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_genre_binge", Name: "Genre Binge Reader", Description: "Read {threshold}+ manga of the same genre in one week", Category: CategoryMangaBinge, MaxTier: 10, TierThresholds: []int{5, 8, 12, 15, 20, 25, 30, 40, 50, 75}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_author_binge", Name: "Author Binge", Description: "Read 5+ manga by the same author in one week", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_chapter_counter_day", Name: "Daily Chapter Record", Description: "Read {threshold}+ chapters in a single calendar day", Category: CategoryMangaBinge, MaxTier: 10, TierThresholds: []int{10, 25, 50, 75, 100, 150, 200, 300, 500, 750}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_multi_series_binge", Name: "Multi-Series Read", Description: "Read from {threshold}+ different manga in one day", Category: CategoryMangaBinge, MaxTier: 10, TierThresholds: []int{3, 5, 7, 10, 15, 20, 25, 30, 40, 50}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_midnight_binge", Name: "Midnight Reading Binge", Description: "Read {threshold}+ chapters between midnight and 4 AM in one session", Category: CategoryMangaBinge, MaxTier: 10, TierThresholds: []int{10, 25, 50, 75, 100, 125, 150, 200, 250, 300}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_new_year_binge", Name: "New Year Reading Binge", Description: "Read 50+ chapters on January 1st", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_forty_eight_hour", Name: "48-Hour Reading Marathon", Description: "Read manga for 48 cumulative hours in one week", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "m_oneshot_binge", Name: "Oneshot Binge", Description: "Read 10+ oneshot manga in a single day", Category: CategoryMangaBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},

	// ═══════════════════════════════════════════════
	// MANGA ADDITIONAL COMPLETION (8 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_multi_reread", Name: "Multi Reread Manga", Description: "Reread {threshold}+ manga more than once", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_dropped_recovery", Name: "Dropped Recovery Reader", Description: "Complete a manga you previously dropped", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_ten_perfect_scores", Name: "Ten Masterpieces Manga", Description: "Complete 10 manga you rated 10/10", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_complete_genre_span", Name: "Genre Completionist Reader", Description: "Complete manga in {threshold}+ different genres", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{5, 8, 10, 12, 15, 16, 18, 20, 22, 25}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_monthly_completions", Name: "Monthly Manga Completions", Description: "Complete {threshold}+ manga in a single month", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{5, 10, 15, 20, 30, 40, 50, 75, 100, 150}, TierNames: t10, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_yearly_completions", Name: "Yearly Manga Completions", Description: "Complete {threshold}+ manga in a calendar year", Category: CategoryMangaCompletion, MaxTier: 10, TierThresholds: []int{25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_rapid_complete", Name: "Rapid Complete Reader", Description: "Complete 3+ manga in a single day", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_author_complete", Name: "Author Complete", Description: "Complete all works by a single mangaka", Category: CategoryMangaCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA ADDITIONAL DEDICATION (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_genre_master", Name: "Genre Master Reader", Description: "Read 50+ manga in any single genre", Category: CategoryMangaDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_multi_series_author", Name: "Multi-Series Author Fan", Description: "Read {threshold}+ series by the same author", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{3, 5, 8, 12, 20, 30, 50, 75, 100, 150}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_format_diversity", Name: "Format Diversity Reader", Description: "Read manga in {threshold}+ different formats from the same franchise", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{2, 3, 4, 5, 6, 7, 8, 9, 10, 10}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_year_dedication", Name: "Year Dedication Reader", Description: "Read {threshold}+ manga from a single year", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 75, 100, 150, 200, 300}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_ongoing_follower", Name: "Ongoing Follower", Description: "Follow {threshold}+ ongoing manga to completion", Category: CategoryMangaDedication, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_genre_loyalty_50", Name: "Genre Loyalty 50%", Description: "Have 50%+ of your manga in a single genre", Category: CategoryMangaDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA ADDITIONAL DISCOVERY (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_top_rated_reader", Name: "Top Rated Reader", Description: "Read {threshold}+ of the top 50 highest-rated manga", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 10, 15, 20, 25, 30, 35, 40, 45, 50}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_source_variety", Name: "Source Variety Reader", Description: "Read manga adapted from {threshold}+ different source types", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{2, 3, 4, 5, 6, 7, 8, 9, 10, 10}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_low_score_brave", Name: "Brave Reader", Description: "Complete {threshold}+ manga with average score below 6.0", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_short_manga_explorer", Name: "Short Manga Explorer", Description: "Complete {threshold}+ manga with 1-10 chapters", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_long_manga_explorer", Name: "Long Manga Explorer", Description: "Complete {threshold}+ manga with 100+ chapters", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 40, 60, 100, 200, 400, 800}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_serialization_explorer", Name: "Serialization Explorer", Description: "Read manga from {threshold}+ different magazines/publications", Category: CategoryMangaDiscovery, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 30, 50, 75, 100, 150, 200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA ADDITIONAL TIME (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_weekend_binge_hours", Name: "Weekend Reading Hours", Description: "Spend {threshold}+ hours reading on a single weekend", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{3, 6, 10, 16, 24, 30, 36, 42, 48, 72}, TierNames: t10, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "m_late_night_regular", Name: "Late Night Regular Reader", Description: "Read manga past midnight on {threshold}+ different days", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_sunrise_reader", Name: "Sunrise Reader", Description: "Read manga from 4 AM to 7 AM", Category: CategoryMangaTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_every_day_of_week", Name: "Every Day of Week Reader", Description: "Read manga on every day of the week in one week", Category: CategoryMangaTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_monthly_hours", Name: "Monthly Reading Hours", Description: "Spend {threshold}+ hours reading manga in a single month", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "m_bedtime_reader", Name: "Bedtime Reader", Description: "Read {threshold}+ chapters between 10 PM and midnight", Category: CategoryMangaTime, MaxTier: 10, TierThresholds: []int{50, 200, 500, 1000, 2500, 4000, 8000, 20000, 60000, 210000}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},

	// ═══════════════════════════════════════════════
	// MANGA ADDITIONAL SPECIAL (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_double_digits", Name: "Double Digits Manga", Description: "Have exactly 11 manga completed", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_one_two_three", Name: "One Two Three Manga", Description: "Have exactly 123 manga completed", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_lucky_seven", Name: "Lucky Seven Manga", Description: "Have exactly 7 manga rated 7/10", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_exact_hundred_ch", Name: "Exact Hundred Chapters", Description: "Have exactly 100 chapters read total", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_year_match_count", Name: "Year Match Manga", Description: "Complete a manga count matching the current year's last 2 digits", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_chapter_match_date", Name: "Chapter Match Date", Description: "Read exactly as many chapters in a day as the date number", Category: CategoryMangaSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},

	// ═══════════════════════════════════════════════
	// MANGA ADDITIONAL STREAKS (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_completion_streak", Name: "Completion Streak Reader", Description: "Complete a manga every day for {threshold}+ consecutive days", Category: CategoryMangaStreaks, MaxTier: 10, TierThresholds: []int{3, 5, 7, 10, 14, 21, 30, 45, 60, 90}, TierNames: t10, Triggers: []EvalTrigger{TriggerMangaComplete}},
	{Key: "m_rating_streak", Name: "Rating Streak Reader", Description: "Rate manga every day for {threshold}+ consecutive days", Category: CategoryMangaStreaks, MaxTier: 10, TierThresholds: []int{3, 7, 14, 21, 30, 45, 60, 90, 120, 180}, TierNames: t10, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "m_multi_ch_streak", Name: "Multi-Chapter Streak", Description: "Read 10+ chapters every day for {threshold}+ days", Category: CategoryMangaStreaks, MaxTier: 10, TierThresholds: []int{7, 14, 30, 60, 100, 150, 200, 250, 300, 365}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_author_streak", Name: "Author Streak", Description: "Read the same author's manga for {threshold}+ consecutive days", Category: CategoryMangaStreaks, MaxTier: 10, TierThresholds: []int{3, 5, 7, 10, 14, 21, 30, 45, 60, 90}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_perfect_week_manga", Name: "Perfect Week Reader", Description: "Read manga, rate manga, and complete manga all in one week", Category: CategoryMangaStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_diverse_streak", Name: "Diverse Streak", Description: "Read from {threshold}+ different genres in consecutive days", Category: CategoryMangaStreaks, MaxTier: 10, TierThresholds: []int{3, 5, 7, 10, 12, 14, 16, 18, 20, 22}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},

	// ═══════════════════════════════════════════════
	// MANGA ADDITIONAL SCORING (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_masterpiece_hunter", Name: "Masterpiece Hunter Manga", Description: "Read {threshold}+ manga with community score > 9.0", Category: CategoryMangaScoring, MaxTier: 10, TierThresholds: []int{3, 5, 10, 15, 20, 25, 30, 40, 50, 75}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_contrarian", Name: "Contrarian Reader", Description: "Rate {threshold}+ manga 3+ points below community average", Category: CategoryMangaScoring, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_optimist", Name: "Optimist Reader", Description: "Rate {threshold}+ manga 2+ points above community average", Category: CategoryMangaScoring, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_score_distributor", Name: "Score Distributor Reader", Description: "Have at least 5 manga at every score from 1-10", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_genre_critic", Name: "Genre Critic Reader", Description: "Rate 10+ manga in {threshold}+ different genres", Category: CategoryMangaScoring, MaxTier: 10, TierThresholds: []int{3, 5, 8, 10, 12, 14, 16, 18, 20, 22}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_mean_above_8", Name: "High Standards Manga", Description: "Maintain a mean score above 8.0 with 100+ rated manga", Category: CategoryMangaScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA ADDITIONAL CREATIVE (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_vertical_scroll", Name: "Vertical Scroll Expert", Description: "Read {threshold}+ vertical-scroll manga", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_traditional_format", Name: "Traditional Format", Description: "Read {threshold}+ traditional right-to-left manga", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_cross_media", Name: "Cross Media", Description: "Read manga whose anime, movie, and game adaptations you also consumed", Category: CategoryMangaCreative, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_spinoff_reader", Name: "Spinoff Reader", Description: "Read {threshold}+ manga spinoffs", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_remake_reader", Name: "Remake Reader", Description: "Read both original and remake versions of a manga", Category: CategoryMangaCreative, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_collaboration_reader", Name: "Collaboration Reader", Description: "Read manga with {threshold}+ different writer-artist combinations", Category: CategoryMangaCreative, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// MANGA ADDITIONAL HOLIDAY (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_earth_day", Name: "Earth Day Reader", Description: "Read a nature-themed manga on April 22nd", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_labor_day", Name: "Labor Day Reader", Description: "Read manga on Labor Day", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_winter_solstice", Name: "Winter Solstice Reader", Description: "Read manga on December 21st", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_manga_birthday", Name: "Manga Birthday", Description: "Read manga on the anniversary of your first manga completion", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_every_holiday_reader", Name: "Every Holiday Reader", Description: "Read manga on {threshold}+ different recognized holidays in a year", Category: CategoryMangaHoliday, MaxTier: 10, TierThresholds: []int{3, 5, 7, 10, 12, 14, 16, 18, 20, 25}, TierNames: t10, Triggers: []EvalTrigger{TriggerChapterProgress}},
	{Key: "m_consecutive_holidays", Name: "Consecutive Holidays Reader", Description: "Read manga on 3+ consecutive recognized holidays", Category: CategoryMangaHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerChapterProgress}},

	// ═══════════════════════════════════════════════
	// MANGA FORMATS (new section, 8 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_manga_format", Name: "Manga Format Reader", Description: "Read {threshold}+ standard manga", Category: CategoryMangaFormats, MaxTier: 10, TierThresholds: []int{10, 50, 100, 250, 500, 800, 1600, 4000, 12000, 42000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_manhwa_format", Name: "Manhwa Format Reader", Description: "Read {threshold}+ manhwa", Category: CategoryMangaFormats, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_manhua_format", Name: "Manhua Format Reader", Description: "Read {threshold}+ manhua", Category: CategoryMangaFormats, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_ln_format", Name: "Light Novel Format", Description: "Read {threshold}+ light novels", Category: CategoryMangaFormats, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_oneshot_format", Name: "Oneshot Format Reader", Description: "Read {threshold}+ oneshots", Category: CategoryMangaFormats, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_doujin_format", Name: "Doujinshi Format", Description: "Read {threshold}+ doujinshi", Category: CategoryMangaFormats, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_novel_format", Name: "Novel Format", Description: "Read {threshold}+ novels", Category: CategoryMangaFormats, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "m_format_master_manga", Name: "Format Master Reader", Description: "Read entries in {threshold}+ different formats", Category: CategoryMangaFormats, MaxTier: 10, TierThresholds: []int{2, 3, 4, 5, 6, 7, 8, 9, 10, 10}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
}

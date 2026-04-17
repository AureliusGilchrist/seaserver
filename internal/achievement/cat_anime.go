package achievement

// t10 is a helper for standard 10-tier names.
var t10 = []string{"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"}

// animeDefinitions contains all 250 anime achievement definitions.
var animeDefinitions = []Definition{

	// ═══════════════════════════════════════════════
	// ANIME MILESTONES (20 definitions)
	// ═══════════════════════════════════════════════

	// NOTE: TriggerCollectionRefresh added so HandleImportAchievements can unlock this retroactively.
	{Key: "a_first_episode", Name: "First Episode", Description: "Watch your very first anime episode", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress, TriggerCollectionRefresh}},
	{Key: "a_episode_counter", Name: "Episode Counter", Description: "Watch {threshold}+ episodes total", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{100, 500, 1000, 2500, 5000, 8000, 16000, 40000, 120000, 420000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_episode_titan", Name: "Episode Titan", Description: "Watch {threshold}+ episodes total", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{7500, 10000, 15000, 20000, 30000, 48000, 96000, 240000, 720000, 2520000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_hours_invested", Name: "Hours Invested", Description: "Spend {threshold}+ hours watching anime", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{100, 500, 1000, 2500, 5000, 8000, 16000, 40000, 120000, 420000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_time_lord", Name: "Time Lord", Description: "Spend {threshold}+ hours watching anime", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{7500, 10000, 15000, 20000, 30000, 48000, 96000, 240000, 720000, 2520000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_anime_collector", Name: "Anime Collector", Description: "Have {threshold}+ anime on your list", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{25, 100, 250, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_library_legend", Name: "Library Legend", Description: "Have {threshold}+ anime on your list", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{1500, 2000, 3000, 4000, 5000, 8000, 16000, 40000, 120000, 420000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_first_complete", Name: "First Completion", Description: "Complete your first anime series", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete, TriggerCollectionRefresh}},
	{Key: "a_hundred_club", Name: "The Hundred Club", Description: "Watch 100 different anime", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_first_day", Name: "Day One", Description: "Watch anime for the first time on Seanime", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress, TriggerCollectionRefresh}},
	{Key: "a_first_rating", Name: "First Impression", Description: "Rate your first anime", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerRatingChange, TriggerCollectionRefresh}},
	{Key: "a_ten_thousand_min", Name: "Ten Thousand Minutes", Description: "Watch 10,000 minutes of anime", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_season_veteran", Name: "Season Veteran", Description: "Watch anime from {threshold}+ different seasons", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{4, 8, 16, 32, 50, 60, 70, 80, 90, 100}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_year_explorer", Name: "Year Explorer", Description: "Watch anime from {threshold}+ different years", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{5, 10, 15, 20, 30, 35, 40, 45, 50, 55}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_century_watcher", Name: "Century Watcher", Description: "Watch 100 episodes in a single month", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_five_hundred_eps", Name: "Episode Enthusiast", Description: "Watch 500 episodes", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_thousand_eps", Name: "Episode Addict", Description: "Watch 1,000 episodes", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_watching_ten", Name: "Juggler", Description: "Have 10+ anime currently watching simultaneously", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_ptw_hoarder", Name: "Plan to Watch Hoarder", Description: "Have {threshold}+ anime in plan to watch", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{25, 50, 100, 250, 500, 800, 1600, 4000, 12000, 42000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_dropped_honesty", Name: "Honest Viewer", Description: "Drop {threshold}+ anime", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME BINGE (20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_binge_watcher", Name: "Binge Watcher", Description: "Watch {threshold}+ episodes in a single day", Category: CategoryAnimeBinge, MaxTier: 10, TierThresholds: []int{12, 24, 36, 48, 60, 72, 84, 96, 120, 150}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_marathon_runner", Name: "Marathon Runner", Description: "Complete {threshold} full series in a single day", Category: CategoryAnimeBinge, MaxTier: 10, TierThresholds: []int{1, 2, 3, 4, 5, 6, 7, 8, 10, 15}, TierNames: t10, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_weekend_warrior", Name: "Weekend Warrior", Description: "Watch {threshold}+ episodes on weekends (cumulative)", Category: CategoryAnimeBinge, MaxTier: 10, TierThresholds: []int{50, 200, 500, 1000, 2500, 4000, 8000, 20000, 60000, 210000}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_non_stop", Name: "Non-Stop", Description: "Watch continuously for {threshold}+ hours", Category: CategoryAnimeBinge, MaxTier: 10, TierThresholds: []int{3, 6, 10, 16, 24, 30, 36, 42, 48, 72}, TierNames: t10, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "a_one_more_episode", Name: "One More Episode", Description: "Watch {threshold}+ episodes after midnight in one session", Category: CategoryAnimeBinge, MaxTier: 10, TierThresholds: []int{3, 6, 10, 15, 20, 25, 30, 40, 50, 75}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_speed_run", Name: "Speed Run", Description: "Complete a 12-episode series in one sitting", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_double_feature", Name: "Double Feature", Description: "Complete 2 series in one day", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_triple_threat", Name: "Triple Threat", Description: "Watch 3 different anime in one day", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_five_a_day", Name: "Five-a-Day", Description: "Watch episodes from 5 different anime in one day", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_back_to_back", Name: "Back to Back", Description: "Watch {threshold}+ episodes back to back without break", Category: CategoryAnimeBinge, MaxTier: 10, TierThresholds: []int{5, 10, 15, 20, 30, 40, 50, 60, 75, 100}, TierNames: t10, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "a_seasonal_binge", Name: "Seasonal Binge", Description: "Watch an entire seasonal anime (12eps) in one day", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_cour_crusher", Name: "Cour Crusher", Description: "Watch 24+ episodes in one day", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_half_day_watch", Name: "Half-Day Watch", Description: "Watch 6+ hours of anime in a single day", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "a_full_day_watch", Name: "Full-Day Watch", Description: "Watch 12+ hours of anime in a single day", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "a_power_weekend", Name: "Power Weekend", Description: "Watch {threshold}+ episodes in a single weekend", Category: CategoryAnimeBinge, MaxTier: 10, TierThresholds: []int{10, 20, 30, 40, 50, 60, 75, 100, 125, 150}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_binge_king", Name: "Binge King", Description: "Binge 50+ episodes total across all days", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_no_sleep", Name: "No Sleep", Description: "Watch anime from 10PM to 6AM without stopping", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "a_entire_season", Name: "Entire Season", Description: "Watch all episodes of a 24+ episode series in under 3 days", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_seven_day_challenge", Name: "Seven Day Challenge", Description: "Watch anime every day for a week straight", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_hundred_day_binge", Name: "Hundred-Day Binge", Description: "Watch anime for 100 consecutive days", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},

	// ═══════════════════════════════════════════════
	// ANIME GENRES (60 definitions — 12 genres × 5 tiers)
	// ═══════════════════════════════════════════════

	{Key: "a_genre_action", Name: "Action Hero", Description: "Watch {threshold}+ Action anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_adventure", Name: "Adventurer", Description: "Watch {threshold}+ Adventure anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_comedy", Name: "Comedy Connoisseur", Description: "Watch {threshold}+ Comedy anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_drama", Name: "Drama Sage", Description: "Watch {threshold}+ Drama anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_fantasy", Name: "Fantasy Voyager", Description: "Watch {threshold}+ Fantasy anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_horror", Name: "Horror Fiend", Description: "Watch {threshold}+ Horror anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_mystery", Name: "Mystery Solver", Description: "Watch {threshold}+ Mystery anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_romance", Name: "Romance Devotee", Description: "Watch {threshold}+ Romance anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_scifi", Name: "Sci-Fi Pioneer", Description: "Watch {threshold}+ Sci-Fi anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_sol", Name: "Slice of Life Zen", Description: "Watch {threshold}+ Slice of Life anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_sports", Name: "Sports Champion", Description: "Watch {threshold}+ Sports anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_supernatural", Name: "Supernatural Seer", Description: "Watch {threshold}+ Supernatural anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_thriller", Name: "Thriller Seeker", Description: "Watch {threshold}+ Thriller anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_mecha", Name: "Mecha Pilot", Description: "Watch {threshold}+ Mecha anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_music", Name: "Music Lover", Description: "Watch {threshold}+ Music anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_psychological", Name: "Mind Bender", Description: "Watch {threshold}+ Psychological anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME COMPLETION (20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_completionist", Name: "Completionist", Description: "Complete {threshold}+ anime series", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 250, 400, 800, 2000, 6000, 21000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_mega_completionist", Name: "Mega Completionist", Description: "Complete {threshold}+ anime series", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{500, 750, 1000, 1500, 2000, 3200, 6500, 16000, 48000, 170000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_completion_rate_50", Name: "Halfway There", Description: "Achieve 50% completion rate on your anime list", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_completion_rate_75", Name: "Almost Done", Description: "Achieve 75% completion rate on your anime list", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_completion_rate_90", Name: "Perfectionist", Description: "Achieve 90% completion rate on your anime list", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_no_drop", Name: "Never Drop", Description: "Complete {threshold}+ anime without dropping any", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{25, 50, 100, 200, 500, 800, 1600, 4000, 12000, 42000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_long_runner_complete", Name: "Long Runner", Description: "Complete an anime with {threshold}+ episodes", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{24, 50, 100, 200, 500, 800, 1600, 4000, 12000, 42000}, TierNames: t10, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_sequel_chain", Name: "Sequel Chain", Description: "Complete all seasons of a {threshold}+ season franchise", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{2, 3, 4, 5, 6, 7, 8, 9, 10, 12}, TierNames: t10, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_clean_list", Name: "Clean List", Description: "Have zero paused anime on your list", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_from_ptw", Name: "Plan Executed", Description: "Move {threshold}+ anime from Plan to Watch to Completed", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 250, 400, 800, 2000, 6000, 21000}, TierNames: t10, Triggers: []EvalTrigger{TriggerStatusChange}},
	{Key: "a_rewatch_master", Name: "Rewatch Master", Description: "Rewatch {threshold}+ anime", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_short_complete", Name: "Short & Sweet", Description: "Complete {threshold}+ short anime (< 6 episodes)", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_same_day_start_finish", Name: "Same-Day Start & Finish", Description: "Start and complete an anime on the same day", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_revival", Name: "Revival", Description: "Complete an anime that was on hold for 30+ days", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_zero_to_hero", Name: "Zero to Hero", Description: "Go from 0 to 100 completed anime", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_five_genre_complete", Name: "Genre Sweep", Description: "Complete anime in 5+ different genres in one week", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_full_franchise", Name: "Franchise Fanatic", Description: "Complete every entry in a franchise", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_batch_complete", Name: "Batch Complete", Description: "Complete {threshold}+ anime in a single week", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{3, 5, 7, 10, 15, 20, 25, 30, 40, 50}, TierNames: t10, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_paused_to_done", Name: "Paused to Done", Description: "Complete {threshold}+ previously paused anime", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 50, 75, 100, 150, 200, 300}, TierNames: t10, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_completion_spree", Name: "Completion Spree", Description: "Complete 5 anime in 3 days", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},

	// ═══════════════════════════════════════════════
	// ANIME DEDICATION (20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_loyal_fan", Name: "Loyal Fan", Description: "Watch {threshold}+ episodes of a single anime", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{50, 100, 200, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_studio_devotee", Name: "Studio Devotee", Description: "Watch {threshold}+ anime from the same studio", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_rewatcher", Name: "Rewatcher", Description: "Rewatch an anime series", Category: CategoryAnimeDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerStatusChange}},
	{Key: "a_triple_rewatch", Name: "Triple Rewatch", Description: "Rewatch the same anime 3 times", Category: CategoryAnimeDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerStatusChange}},
	{Key: "a_annual_tradition", Name: "Annual Tradition", Description: "Watch the same anime in two different years", Category: CategoryAnimeDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_director_fan", Name: "Director Fan", Description: "Watch {threshold}+ anime by the same director", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{3, 5, 8, 12, 20, 25, 30, 40, 50, 75}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_voice_actor_fan", Name: "Voice Actor Fan", Description: "Watch {threshold}+ anime featuring the same VA", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_ost_lover", Name: "OST Lover", Description: "Watch {threshold}+ anime known for their soundtracks", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_source_reader", Name: "Source Reader", Description: "Watch anime adaptations of manga you have read", Category: CategoryAnimeDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_waiting_weekly", Name: "Weekly Waiter", Description: "Follow {threshold}+ airing anime simultaneously", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{3, 5, 8, 12, 20, 25, 30, 40, 50, 75}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_childhood_revisit", Name: "Childhood Revisit", Description: "Watch anime originally aired before 2005", Category: CategoryAnimeDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_saga_tracker", Name: "Saga Tracker", Description: "Follow an anime franchise for 100+ episodes across sequels", Category: CategoryAnimeDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_loyalty", Name: "Genre Loyalty", Description: "Have 30%+ of your anime in a single genre", Category: CategoryAnimeDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_decade_watcher", Name: "Decade Watcher", Description: "Watch anime from {threshold}+ different decades", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{2, 3, 4, 5, 6, 7, 8, 9, 10, 10}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_adaptation_hunter", Name: "Adaptation Hunter", Description: "Watch {threshold}+ anime adapted from light novels", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_original_anime_fan", Name: "Original Anime Fan", Description: "Watch {threshold}+ anime-original series", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_long_commitment", Name: "Long Commitment", Description: "Follow an ongoing anime for 6+ months", Category: CategoryAnimeDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_perfect_attendance", Name: "Perfect Attendance", Description: "Watch every episode of a seasonal anime as it airs", Category: CategoryAnimeDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_favorite_studio_5", Name: "Studio Loyalty", Description: "Watch 5+ anime from your most-watched studio", Category: CategoryAnimeDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_complete_catalog", Name: "Complete Catalog", Description: "Watch 50%+ of a studio's catalog", Category: CategoryAnimeDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME DISCOVERY (20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_genre_explorer", Name: "Genre Explorer", Description: "Watch anime from {threshold}+ different genres", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{5, 8, 10, 12, 15, 16, 18, 20, 22, 25}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_studio_hopper", Name: "Studio Hopper", Description: "Watch anime from {threshold}+ different studios", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_explorer", Name: "Tag Explorer", Description: "Watch anime with {threshold}+ different tags", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_decade_hopper", Name: "Decade Hopper", Description: "Watch anime from {threshold}+ different decades", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{3, 4, 5, 6, 7, 8, 9, 10, 10, 10}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_hidden_gem", Name: "Hidden Gem Finder", Description: "Watch {threshold}+ anime with < 50K members on AniList", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_popular_taste", Name: "Popular Taste", Description: "Watch {threshold}+ of the top 100 most popular anime", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{10, 25, 40, 60, 80, 85, 90, 93, 96, 100}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_retro_appreciator", Name: "Retro Appreciator", Description: "Watch {threshold}+ anime from before 2000", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_modern_viewer", Name: "Modern Viewer", Description: "Watch {threshold}+ anime from the current year", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_cross_demographic", Name: "Cross Demographic", Description: "Watch anime from 3+ different demographics (shounen, seinen, etc.)", Category: CategoryAnimeDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_underdog_fan", Name: "Underdog Fan", Description: "Rate a low-popularity anime 8 or higher", Category: CategoryAnimeDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "a_variety_week", Name: "Variety Week", Description: "Watch 7+ different genres in one week", Category: CategoryAnimeDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_foreign_cinema", Name: "Foreign Cinema", Description: "Watch anime from a non-Japanese studio", Category: CategoryAnimeDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_classic_connoisseur", Name: "Classic Connoisseur", Description: "Watch {threshold}+ anime from the 80s and 90s", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{5, 10, 20, 35, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_every_season", Name: "Season Sampler", Description: "Watch anime from all 4 seasons in one year", Category: CategoryAnimeDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_award_winner", Name: "Award Winner Watcher", Description: "Watch {threshold}+ highly-rated anime (score > 8.5)", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_niche_explorer", Name: "Niche Explorer", Description: "Watch anime in 3+ uncommon genres (Dementia, Josei, etc.)", Category: CategoryAnimeDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_global_anime", Name: "Global Anime", Description: "Watch anime set in {threshold}+ different real-world countries", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{3, 5, 8, 12, 20, 25, 30, 35, 40, 50}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_cult_classic", Name: "Cult Classic Fan", Description: "Watch 5+ cult classic anime", Category: CategoryAnimeDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_random_pick", Name: "Random Pick", Description: "Start watching a randomly selected anime", Category: CategoryAnimeDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerPlatformEvent}},
	{Key: "a_new_genre_month", Name: "New Genre Monthly", Description: "Try a new genre you haven't watched before", Category: CategoryAnimeDiscovery, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME TIME (20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_night_owl", Name: "Night Owl", Description: "Watch {threshold}+ episodes between midnight and 6 AM", Category: CategoryAnimeTime, MaxTier: 10, TierThresholds: []int{50, 200, 500, 1000, 2500, 4000, 8000, 20000, 60000, 210000}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_early_bird", Name: "Early Bird", Description: "Watch {threshold}+ episodes between 5 AM and 9 AM", Category: CategoryAnimeTime, MaxTier: 10, TierThresholds: []int{25, 100, 250, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_lunch_break", Name: "Lunch Break Watcher", Description: "Watch {threshold}+ episodes between 11 AM and 1 PM", Category: CategoryAnimeTime, MaxTier: 10, TierThresholds: []int{25, 100, 250, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_golden_hour", Name: "Golden Hour", Description: "Watch {threshold}+ episodes between 6 PM and 8 PM", Category: CategoryAnimeTime, MaxTier: 10, TierThresholds: []int{25, 100, 250, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_four_am_club", Name: "4 AM Club", Description: "Watch an episode at 4 AM", Category: CategoryAnimeTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_witching_hour", Name: "The Witching Hour", Description: "Watch a horror anime at 3 AM", Category: CategoryAnimeTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_new_year_watch", Name: "New Year's Watch", Description: "Watch anime on January 1st", Category: CategoryAnimeTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_midnight_premiere", Name: "Midnight Première", Description: "Start a new anime exactly at midnight", Category: CategoryAnimeTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_all_hours", Name: "All Hours", Description: "Watch anime in every hour of the day (24/24)", Category: CategoryAnimeTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_dawn_warrior", Name: "Dawn Warrior", Description: "Watch anime from midnight to dawn (6 AM consecutive)", Category: CategoryAnimeTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "a_afternoon_delight", Name: "Afternoon Delight", Description: "Watch {threshold}+ episodes between 2 PM and 5 PM", Category: CategoryAnimeTime, MaxTier: 10, TierThresholds: []int{25, 100, 250, 500, 1000, 1600, 3200, 8000, 24000, 84000}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_prime_time", Name: "Prime Time", Description: "Watch {threshold}+ episodes between 8 PM and 11 PM", Category: CategoryAnimeTime, MaxTier: 10, TierThresholds: []int{50, 200, 500, 1000, 2500, 4000, 8000, 20000, 60000, 210000}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_workday_watcher", Name: "Workday Watcher", Description: "Watch {threshold}+ episodes on weekdays", Category: CategoryAnimeTime, MaxTier: 10, TierThresholds: []int{50, 200, 500, 1000, 2500, 4000, 8000, 20000, 60000, 210000}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_sunday_marathon", Name: "Sunday Marathon", Description: "Watch 10+ episodes on a Sunday", Category: CategoryAnimeTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_rainy_day", Name: "Rainy Day Watcher", Description: "Watch 20+ episodes in a single day", Category: CategoryAnimeTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_morning_routine", Name: "Morning Routine", Description: "Watch anime before 9 AM for 7 days straight", Category: CategoryAnimeTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_night_shift", Name: "Night Shift", Description: "Watch anime after midnight for {threshold}+ days", Category: CategoryAnimeTime, MaxTier: 10, TierThresholds: []int{7, 14, 30, 60, 100, 150, 200, 250, 300, 365}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_twilight_zone", Name: "Twilight Zone", Description: "Watch anime between 3 AM and 5 AM for 3 consecutive days", Category: CategoryAnimeTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_seasonal_premier", Name: "Seasonal Première", Description: "Watch a seasonal anime on its premiere day", Category: CategoryAnimeTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_clock_collector", Name: "Clock Collector", Description: "Watch anime in {threshold}+ different hours (unique hours)", Category: CategoryAnimeTime, MaxTier: 10, TierThresholds: []int{6, 12, 15, 18, 20, 21, 22, 23, 24, 24}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},

	// ═══════════════════════════════════════════════
	// ANIME SOCIAL (10 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_first_party", Name: "First Watch Party", Description: "Join your first Nakama watch party", Category: CategoryAnimeSocial, MaxTier: 0, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_party_host", Name: "Party Host", Description: "Host {threshold}+ Nakama watch parties", Category: CategoryAnimeSocial, MaxTier: 10, TierThresholds: []int{1, 5, 10, 25, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_social_butterfly", Name: "Social Butterfly", Description: "Watch with {threshold}+ different peers", Category: CategoryAnimeSocial, MaxTier: 10, TierThresholds: []int{2, 5, 10, 20, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_group_binge", Name: "Group Binge", Description: "Watch {threshold}+ episodes in a single watch party", Category: CategoryAnimeSocial, MaxTier: 10, TierThresholds: []int{6, 12, 18, 24, 36, 48, 60, 72, 96, 120}, TierNames: t10, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_party_regular", Name: "Party Regular", Description: "Attend {threshold}+ watch parties total", Category: CategoryAnimeSocial, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_sync_viewer", Name: "Synced Viewing", Description: "Watch in perfect sync with peers for 30+ minutes", Category: CategoryAnimeSocial, MaxTier: 0, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_commentator", Name: "Commentator", Description: "Post {threshold}+ comments on anime entries", Category: CategoryAnimeSocial, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 250, 400, 800, 2000, 6000, 21000}, TierNames: t10, Triggers: []EvalTrigger{TriggerComment}},
	{Key: "a_party_marathon", Name: "Party Marathon", Description: "Host a watch party lasting 4+ hours", Category: CategoryAnimeSocial, MaxTier: 0, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_full_house", Name: "Full House", Description: "Have 5+ peers in a single watch party", Category: CategoryAnimeSocial, MaxTier: 0, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_community_pillar", Name: "Community Pillar", Description: "Be active in social features for 30+ days", Category: CategoryAnimeSocial, MaxTier: 0, Triggers: []EvalTrigger{TriggerNakamaEvent}},

	// ═══════════════════════════════════════════════
	// ANIME SPECIAL (15 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_round_number", Name: "Round Number", Description: "Complete your 100th anime", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_fibonacci", Name: "Fibonacci", Description: "Complete anime count is a Fibonacci number (8,13,21,34...)", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_palindrome_day", Name: "Palindrome Day", Description: "Complete an anime on a palindrome date", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_binary_day", Name: "Binary Day", Description: "Watch anime on a binary date (01/01, 01/10, etc.)", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_full_moon", Name: "Full Moon Watcher", Description: "Watch anime during a full moon", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_leap_year", Name: "Leap Year", Description: "Watch anime on Feb 29", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_time_traveler", Name: "Time Traveler", Description: "Watch anime from 5+ different decades in one day", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_genre_clash", Name: "Genre Clash", Description: "Watch a horror anime followed by a romance anime in the same session", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_triple_seven", Name: "Triple Seven", Description: "Have exactly 777 episodes watched", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_thousand_complete", Name: "One Thousand", Description: "Complete your 1,000th anime", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_pi_episodes", Name: "Pi Episodes", Description: "Watch exactly 314 episodes total", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_synchronicity", Name: "Synchronicity", Description: "Watch episode N of an anime on the Nth day of the month", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_world_record", Name: "Personal Record", Description: "Set a new personal record for episodes in a single day", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_nice", Name: "Nice", Description: "Have exactly 69 anime completed", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_power_level", Name: "Over 9000", Description: "Watch over 9,000 episodes total", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME FORMATS (15 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_tv_watcher", Name: "TV Watcher", Description: "Watch {threshold}+ TV anime", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{10, 50, 100, 250, 500, 800, 1600, 4000, 12000, 42000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_movie_buff", Name: "Movie Buff", Description: "Watch {threshold}+ anime movies", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_ova_hunter", Name: "OVA Hunter", Description: "Watch {threshold}+ OVA series", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_ona_explorer", Name: "ONA Explorer", Description: "Watch {threshold}+ ONA series", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_special_watcher", Name: "Special Watcher", Description: "Watch {threshold}+ Special episodes", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_short_king", Name: "Short King", Description: "Watch {threshold}+ short anime (< 5 min episodes)", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_variety_pack", Name: "Variety Pack", Description: "Watch anime in all available formats", Category: CategoryAnimeFormats, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_film_festival", Name: "Film Festival", Description: "Watch 5 anime movies in one week", Category: CategoryAnimeFormats, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_music_video", Name: "Music Video Fan", Description: "Watch {threshold}+ music anime", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{3, 8, 15, 25, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tv_short", Name: "TV Short Expert", Description: "Watch {threshold}+ TV shorts", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_movie_marathon", Name: "Movie Marathon", Description: "Watch 3+ anime movies in a single day", Category: CategoryAnimeFormats, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_double_length", Name: "Double-Length", Description: "Watch {threshold}+ anime with 40+ min episodes", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_anthology", Name: "Anthology Fan", Description: "Watch 5+ anthology-style anime", Category: CategoryAnimeFormats, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_mini_series", Name: "Mini-Series Collector", Description: "Watch {threshold}+ anime with 3 or fewer episodes", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{3, 8, 15, 25, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_theatrical", Name: "Theatrical Release", Description: "Watch a theatrical anime movie", Category: CategoryAnimeFormats, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},

	// ═══════════════════════════════════════════════
	// ANIME STREAKS (20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_daily_streak", Name: "Daily Streak", Description: "Watch anime for {threshold}+ consecutive days", Category: CategoryAnimeStreaks, MaxTier: 10, TierThresholds: []int{7, 14, 30, 60, 100, 150, 200, 250, 300, 365}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_mega_streak", Name: "Mega Streak", Description: "Watch anime for {threshold}+ consecutive days", Category: CategoryAnimeStreaks, MaxTier: 10, TierThresholds: []int{150, 200, 250, 300, 365, 400, 450, 500, 600, 730}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_weekly_warrior", Name: "Weekly Warrior", Description: "Watch anime every week for {threshold}+ weeks", Category: CategoryAnimeStreaks, MaxTier: 10, TierThresholds: []int{4, 8, 16, 26, 52, 78, 104, 130, 156, 208}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_monthly_watcher", Name: "Monthly Watcher", Description: "Watch anime every month for {threshold}+ months", Category: CategoryAnimeStreaks, MaxTier: 10, TierThresholds: []int{3, 6, 9, 12, 24, 36, 48, 60, 84, 120}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_comeback", Name: "Comeback", Description: "Resume watching after a 30+ day break", Category: CategoryAnimeStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_weekend_streak", Name: "Weekend Streak", Description: "Watch anime every weekend for {threshold}+ weeks", Category: CategoryAnimeStreaks, MaxTier: 10, TierThresholds: []int{4, 8, 12, 20, 40, 52, 78, 104, 130, 156}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_no_zero_days", Name: "No Zero Days", Description: "Have no zero-activity days for a full month", Category: CategoryAnimeStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_iron_will", Name: "Iron Will", Description: "Maintain a 50+ day streak", Category: CategoryAnimeStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_habit_formed", Name: "Habit Formed", Description: "Watch anime at the same hour for 7+ days in a row", Category: CategoryAnimeStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_consistent_pace", Name: "Consistent Pace", Description: "Watch 1+ episodes daily for 14 consecutive days", Category: CategoryAnimeStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_year_long", Name: "Year-Long Dedication", Description: "Watch anime every month for a full year", Category: CategoryAnimeStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_double_streak", Name: "Double Streak", Description: "Maintain anime AND manga streaks simultaneously for 7+ days", Category: CategoryAnimeStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_streak_recovery", Name: "Streak Recovery", Description: "Rebuild a 14+ day streak after losing one", Category: CategoryAnimeStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_daily_minimum", Name: "Daily Minimum", Description: "Watch at least 1 episode every day for {threshold} days", Category: CategoryAnimeStreaks, MaxTier: 10, TierThresholds: []int{7, 14, 30, 60, 100, 150, 200, 250, 300, 365}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_winter_streak", Name: "Winter Streak", Description: "Watch anime every day in December", Category: CategoryAnimeStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_summer_streak", Name: "Summer Streak", Description: "Watch anime every day in July", Category: CategoryAnimeStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_morning_streak", Name: "Morning Streak", Description: "Watch anime before 9 AM for {threshold}+ consecutive days", Category: CategoryAnimeStreaks, MaxTier: 10, TierThresholds: []int{3, 7, 14, 21, 30, 45, 60, 90, 120, 180}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_night_streak", Name: "Night Streak", Description: "Watch anime after midnight for {threshold}+ consecutive days", Category: CategoryAnimeStreaks, MaxTier: 10, TierThresholds: []int{3, 7, 14, 21, 30, 45, 60, 90, 120, 180}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_unbreakable", Name: "Unbreakable", Description: "Maintain a 100+ day anime watching streak", Category: CategoryAnimeStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_eternal_flame", Name: "Eternal Flame", Description: "Maintain a 365 day streak", Category: CategoryAnimeStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},

	// ═══════════════════════════════════════════════
	// ANIME SCORING (15 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_critic", Name: "Critic", Description: "Rate {threshold}+ anime", Category: CategoryAnimeScoring, MaxTier: 10, TierThresholds: []int{25, 50, 100, 250, 500, 800, 1600, 4000, 12000, 42000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_perfect_ten", Name: "Perfect Ten", Description: "Give {threshold}+ anime a score of 10", Category: CategoryAnimeScoring, MaxTier: 10, TierThresholds: []int{1, 5, 10, 25, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "a_harsh_critic", Name: "Harsh Critic", Description: "Give {threshold}+ anime a score of 1-3", Category: CategoryAnimeScoring, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "a_fair_judge", Name: "Fair Judge", Description: "Have an average score between 5.0 and 7.0 with 50+ ratings", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_generous_spirit", Name: "Generous Spirit", Description: "Have an average score above 8.0 with 50+ ratings", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_score_all", Name: "Rate Everything", Description: "Rate every anime on your completed list", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_wide_range", Name: "Wide Range", Description: "Use every score from 1-10 at least once", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_controversial", Name: "Controversial", Description: "Rate an anime 4+ points different from its average score", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "a_consistent_scorer", Name: "Consistent Scorer", Description: "Rate 20+ anime the same score", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_score_sniper", Name: "Score Sniper", Description: "Rate an anime exactly at the community average (±0.1)", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "a_evolving_taste", Name: "Evolving Taste", Description: "Change scores on {threshold}+ anime", Category: CategoryAnimeScoring, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "a_bell_curve", Name: "Bell Curve", Description: "Have a score distribution resembling a bell curve", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_picky_watcher", Name: "Picky Watcher", Description: "Have an average score below 5.0 with 25+ ratings", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_100_rated", Name: "Century Critic", Description: "Rate 100 anime", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_500_rated", Name: "Master Critic", Description: "Rate 500 anime", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME HOLIDAY (15 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_new_years_resolution", Name: "New Year's Resolution", Description: "Watch anime on January 1st", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_valentines_weeb", Name: "Valentine's Weeb", Description: "Watch a romance anime on February 14th", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_pi_day", Name: "Pi Day", Description: "Watch anime on March 14th", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_april_fools", Name: "April Fool's", Description: "Watch a comedy anime on April 1st", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_international_anime_day", Name: "International Anime Day", Description: "Watch anime on April 15th", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_star_wars_day", Name: "Star Wars Day", Description: "Watch a Sci-Fi anime on May 4th", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_summer_solstice", Name: "Summer Solstice", Description: "Watch anime on June 21st", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_tanabata", Name: "Tanabata", Description: "Watch a romance anime on July 7th", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_friday_13th", Name: "Friday the 13th", Description: "Watch a horror anime on Friday the 13th", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_halloween_spirit", Name: "Halloween Spirit", Description: "Watch a horror anime on October 31st", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_thanksgiving_binge", Name: "Thanksgiving Binge", Description: "Watch 10+ episodes on Thanksgiving", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_christmas_special", Name: "Christmas Special", Description: "Watch anime on December 25th", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_new_years_eve", Name: "New Year's Eve", Description: "Watch anime on December 31st", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_birthday_watch", Name: "Birthday Watch", Description: "Watch anime on your birthday (AniList profile birthday)", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_holiday_marathon", Name: "Holiday Season Marathon", Description: "Watch anime every day from Dec 24-31", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_independence_day", Name: "Independence Day", Description: "Watch anime on July 4th", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_culture_day", Name: "Culture Day", Description: "Watch anime on November 3rd (Culture Day in Japan)", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_spring_equinox", Name: "Spring Equinox", Description: "Watch anime on March 20th", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},

	// ═══════════════════════════════════════════════
	// ANIME SOCIAL (additional)
	// ═══════════════════════════════════════════════

	{Key: "a_watch_party_streak", Name: "Watch Party Streak", Description: "Host or attend watch parties {threshold}+ weeks in a row", Category: CategoryAnimeSocial, MaxTier: 10, TierThresholds: []int{2, 4, 8, 12, 20, 26, 35, 52, 78, 104}, TierNames: t10, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_diverse_party", Name: "Diverse Party", Description: "Watch 5+ different genres across all watch parties", Category: CategoryAnimeSocial, MaxTier: 0, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_late_night_party", Name: "Late Night Party", Description: "Be in a watch party that goes past midnight", Category: CategoryAnimeSocial, MaxTier: 0, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_party_veteran", Name: "Party Veteran", Description: "Accumulate {threshold}+ total hours in watch parties", Category: CategoryAnimeSocial, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerNakamaEvent}},

	// ═══════════════════════════════════════════════
	// ANIME SPECIAL (additional)
	// ═══════════════════════════════════════════════

	{Key: "a_answer_42", Name: "The Answer", Description: "Have exactly 42 anime completed", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_square_number", Name: "Perfect Square", Description: "Completed anime count is a perfect square (16, 25, 36...)", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_prime_count", Name: "Prime Watcher", Description: "Complete a prime number (>100) of anime", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_matching_date", Name: "Matching Date", Description: "Complete an anime where episode count matches day of month", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_century_episode", Name: "Century Episode", Description: "Watch episode 100+ of any single anime", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},

	// ═══════════════════════════════════════════════
	// ANIME FORMATS (additional)
	// ═══════════════════════════════════════════════

	{Key: "a_format_master", Name: "Format Master", Description: "Complete {threshold}+ anime across all formats", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 250, 400, 800, 2000, 6000, 21000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_long_movie", Name: "Epic Film", Description: "Watch an anime movie over 2 hours long", Category: CategoryAnimeFormats, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_back_catalog", Name: "Back Catalog", Description: "Watch {threshold}+ completed/finished anime series", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{25, 75, 150, 300, 500, 800, 1600, 4000, 12000, 42000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME SCORING (additional)
	// ═══════════════════════════════════════════════

	{Key: "a_mediocre_majority", Name: "Mediocre Majority", Description: "Have 50%+ of ratings between score 5-7", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_rating_spree", Name: "Rating Spree", Description: "Rate {threshold}+ anime in a single day", Category: CategoryAnimeScoring, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 75, 100, 150, 200, 300}, TierNames: t10, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "a_score_variance", Name: "Score Variance", Description: "Have a standard deviation of 2.0+ in your anime scores", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME GENRES (additional)
	// ═══════════════════════════════════════════════

	{Key: "a_genre_ecchi", Name: "Ecchi Enthusiast", Description: "Watch {threshold}+ Ecchi anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_mahou_shoujo", Name: "Mahou Shoujo Fan", Description: "Watch {threshold}+ Mahou Shoujo anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME DISCOVERY (additional)
	// ═══════════════════════════════════════════════

	{Key: "a_seasonal_completionist", Name: "Seasonal Completionist", Description: "Watch {threshold}+ anime from a single season", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_unpopular_opinion", Name: "Unpopular Opinion", Description: "Complete {threshold}+ anime with fewer than 10K members", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME DEDICATION (additional)
	// ═══════════════════════════════════════════════

	{Key: "a_franchise_collector", Name: "Franchise Collector", Description: "Watch entries from {threshold}+ different franchises", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_airing_follower", Name: "Airing Follower", Description: "Follow {threshold}+ currently airing anime to completion", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerSeriesComplete}},

	// ═══════════════════════════════════════════════
	// ANIME TAG GENRES (tag-based, 20 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_tag_isekai", Name: "Isekai Traveler", Description: "Watch {threshold}+ Isekai anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_harem", Name: "Harem Collector", Description: "Watch {threshold}+ Harem anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_bl", Name: "Boys' Love Fan", Description: "Watch {threshold}+ Boys' Love anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_gl", Name: "Girls' Love Fan", Description: "Watch {threshold}+ Girls' Love anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_historical", Name: "History Buff", Description: "Watch {threshold}+ Historical anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_military", Name: "Military Strategist", Description: "Watch {threshold}+ Military anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_school", Name: "School Days", Description: "Watch {threshold}+ School anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_martial_arts", Name: "Martial Artist", Description: "Watch {threshold}+ Martial Arts anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_vampire", Name: "Vampire Hunter", Description: "Watch {threshold}+ Vampire anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_samurai", Name: "Samurai Path", Description: "Watch {threshold}+ Samurai anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_space", Name: "Space Explorer", Description: "Watch {threshold}+ Space anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_parody", Name: "Parody Lover", Description: "Watch {threshold}+ Parody anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_idol", Name: "Idol Fan", Description: "Watch {threshold}+ Idol anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_post_apocalyptic", Name: "Post-Apocalyptic Survivor", Description: "Watch {threshold}+ Post-Apocalyptic anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_cyberpunk", Name: "Cyberpunk Runner", Description: "Watch {threshold}+ Cyberpunk anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_shounen", Name: "Shounen Spirit", Description: "Watch {threshold}+ Shounen anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_seinen", Name: "Seinen Connoisseur", Description: "Watch {threshold}+ Seinen anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_shoujo", Name: "Shoujo Heart", Description: "Watch {threshold}+ Shoujo anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_josei", Name: "Josei Appreciator", Description: "Watch {threshold}+ Josei anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_tag_survival", Name: "Survival Expert", Description: "Watch {threshold}+ Survival anime", Category: CategoryAnimeGenres, MaxTier: 10, TierThresholds: []int{3, 8, 15, 30, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME ADDITIONAL MILESTONES (10 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_five_thousand_eps", Name: "Episode Legend", Description: "Watch 5,000 episodes total", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_ten_completed", Name: "First Ten", Description: "Complete 10 anime series", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_fifty_completed", Name: "Half Century", Description: "Complete 50 anime series", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_five_hundred_completed", Name: "Five Hundred Club", Description: "Complete 500 anime series", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_mean_score_tracker", Name: "Mean Score Tracker", Description: "Have a mean score with {threshold}+ rated anime", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{10, 50, 100, 250, 500, 800, 1600, 4000, 12000, 42000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_unique_studios", Name: "Studio Counter", Description: "Watch anime from {threshold}+ unique studios", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 150, 200, 250, 300, 400, 500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_days_spent_watching", Name: "Days of Anime", Description: "Spend {threshold}+ full days watching anime (24hr days)", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{5, 10, 30, 60, 100, 200, 400, 800, 1500, 3000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_all_status", Name: "Every Status", Description: "Have anime in all statuses (Watching, Completed, Paused, Dropped, Planning)", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_first_favorite", Name: "First Favorite", Description: "Add your first anime to favorites", Category: CategoryAnimeMilestones, MaxTier: 0, Triggers: []EvalTrigger{TriggerFavoriteToggle, TriggerCollectionRefresh}},
	{Key: "a_favorites_collector", Name: "Favorites Collector", Description: "Have {threshold}+ anime in your favorites", Category: CategoryAnimeMilestones, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 75, 100, 150, 200, 300}, TierNames: t10, Triggers: []EvalTrigger{TriggerFavoriteToggle, TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME ADDITIONAL BINGE (8 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_genre_binge", Name: "Genre Binge", Description: "Watch {threshold}+ anime of the same genre in one week", Category: CategoryAnimeBinge, MaxTier: 10, TierThresholds: []int{5, 8, 12, 15, 20, 25, 30, 40, 50, 75}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_studio_binge", Name: "Studio Binge", Description: "Watch 5+ anime from the same studio in one week", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_season_sweep", Name: "Season Sweep", Description: "Watch 10+ anime from the same season in one month", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_forty_eight_hour", Name: "48-Hour Marathon", Description: "Watch anime for 48 cumulative hours in one week", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "a_ep_counter_day", Name: "Daily Episode Record", Description: "Watch {threshold}+ episodes in a single calendar day", Category: CategoryAnimeBinge, MaxTier: 10, TierThresholds: []int{6, 12, 20, 30, 40, 50, 60, 75, 100, 150}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_multi_series_binge", Name: "Multi-Series Binge", Description: "Watch episodes from {threshold}+ different series in one day", Category: CategoryAnimeBinge, MaxTier: 10, TierThresholds: []int{3, 5, 7, 10, 15, 20, 25, 30, 40, 50}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_midnight_binge", Name: "Midnight Binge", Description: "Watch {threshold}+ episodes between midnight and 4 AM in one session", Category: CategoryAnimeBinge, MaxTier: 10, TierThresholds: []int{3, 6, 10, 15, 20, 25, 30, 40, 50, 75}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_new_year_binge", Name: "New Year Binge", Description: "Watch 12+ episodes on January 1st", Category: CategoryAnimeBinge, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},

	// ═══════════════════════════════════════════════
	// ANIME ADDITIONAL COMPLETION (8 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_multi_rewatch", Name: "Multi Rewatch", Description: "Rewatch {threshold}+ anime more than once", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_dropped_recovery", Name: "Dropped Recovery", Description: "Complete an anime you previously dropped", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_ten_perfect_scores", Name: "Ten Masterpieces", Description: "Complete 10 anime you rated 10/10", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_seasonal_clear", Name: "Seasonal Clear", Description: "Complete all anime you started from a single season", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_complete_genre_span", Name: "Genre Completionist", Description: "Complete anime in {threshold}+ different genres", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{5, 8, 10, 12, 15, 16, 18, 20, 22, 25}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_monthly_completions", Name: "Monthly Completions", Description: "Complete {threshold}+ anime in a single month", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{5, 10, 15, 20, 30, 40, 50, 75, 100, 150}, TierNames: t10, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_yearly_completions", Name: "Yearly Completions", Description: "Complete {threshold}+ anime in a calendar year", Category: CategoryAnimeCompletion, MaxTier: 10, TierThresholds: []int{25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_rapid_complete", Name: "Rapid Complete", Description: "Complete 3+ anime in a single day", Category: CategoryAnimeCompletion, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},

	// ═══════════════════════════════════════════════
	// ANIME ADDITIONAL DEDICATION (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_genre_master", Name: "Genre Master", Description: "Watch 50+ anime in any single genre", Category: CategoryAnimeDedication, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_staff_follower", Name: "Staff Follower", Description: "Watch {threshold}+ anime sharing the same key staff member", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{5, 10, 15, 20, 30, 40, 50, 75, 100, 150}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_multi_season_fan", Name: "Multi-Season Fan", Description: "Watch all seasons of {threshold}+ multi-season anime", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 30, 50, 75, 100, 150, 200}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_format_diversity", Name: "Format Diversity", Description: "Watch anime in {threshold}+ different formats from the same franchise", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{2, 3, 4, 5, 6, 7, 8, 9, 10, 10}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_year_dedication", Name: "Year Dedication", Description: "Watch {threshold}+ anime from a single year", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{5, 10, 20, 30, 50, 75, 100, 150, 200, 300}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_season_dedication", Name: "Season Dedication", Description: "Watch {threshold}+ anime from a single season of a year", Category: CategoryAnimeDedication, MaxTier: 10, TierThresholds: []int{3, 5, 8, 12, 20, 30, 50, 75, 100, 150}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME ADDITIONAL DISCOVERY (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_top_rated_viewer", Name: "Top Rated Viewer", Description: "Watch {threshold}+ of the top 50 highest-rated anime", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{5, 10, 15, 20, 25, 30, 35, 40, 45, 50}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_source_variety", Name: "Source Variety", Description: "Watch anime adapted from {threshold}+ different source types", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{2, 3, 4, 5, 6, 7, 8, 9, 10, 10}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_low_score_brave", Name: "Brave Viewer", Description: "Complete {threshold}+ anime with average score below 6.0", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_upcoming_watcher", Name: "Early Adopter", Description: "Watch {threshold}+ anime within their first airing season", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_short_series_explorer", Name: "Short Series Explorer", Description: "Complete {threshold}+ anime with 1-6 episodes", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{5, 15, 30, 50, 100, 160, 325, 800, 2400, 8500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_long_series_explorer", Name: "Long Series Explorer", Description: "Complete {threshold}+ anime with 50+ episodes", Category: CategoryAnimeDiscovery, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 40, 60, 100, 200, 400, 800}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME ADDITIONAL TIME (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_weekend_binge_hours", Name: "Weekend Binge Hours", Description: "Spend {threshold}+ hours watching on a single weekend", Category: CategoryAnimeTime, MaxTier: 10, TierThresholds: []int{3, 6, 10, 16, 24, 30, 36, 42, 48, 72}, TierNames: t10, Triggers: []EvalTrigger{TriggerSessionUpdate}},
	{Key: "a_late_night_regular", Name: "Late Night Regular", Description: "Watch anime past midnight on {threshold}+ different days", Category: CategoryAnimeTime, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_sunrise_watcher", Name: "Sunrise Watcher", Description: "Watch anime from 4 AM to 7 AM", Category: CategoryAnimeTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_holiday_watcher", Name: "Holiday Watcher Counter", Description: "Watch anime on {threshold}+ different holidays", Category: CategoryAnimeTime, MaxTier: 10, TierThresholds: []int{3, 5, 8, 10, 12, 14, 16, 18, 20, 25}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_every_day_of_week", Name: "Every Day of Week", Description: "Watch anime on every day of the week in one week", Category: CategoryAnimeTime, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_monthly_hours", Name: "Monthly Hours", Description: "Spend {threshold}+ hours watching anime in a single month", Category: CategoryAnimeTime, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 325, 650, 1600, 4800, 17000}, TierNames: t10, Triggers: []EvalTrigger{TriggerSessionUpdate}},

	// ═══════════════════════════════════════════════
	// ANIME ADDITIONAL SPECIAL (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_double_digits", Name: "Double Digits", Description: "Have exactly 11 anime completed", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_one_two_three", Name: "One Two Three", Description: "Have exactly 123 anime completed", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_lucky_seven", Name: "Lucky Seven", Description: "Have exactly 7 anime rated 7/10", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_all_tens", Name: "All Tens", Description: "Complete an anime with exactly 10 episodes and rate it 10", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_exact_hundred_eps", Name: "Exact Hundred", Description: "Have exactly 100 episodes watched total", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_year_match_count", Name: "Year Match", Description: "Complete an anime count matching the current year's last 2 digits", Category: CategoryAnimeSpecial, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME ADDITIONAL STREAKS (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_completion_streak", Name: "Completion Streak", Description: "Complete an anime every day for {threshold}+ consecutive days", Category: CategoryAnimeStreaks, MaxTier: 10, TierThresholds: []int{3, 5, 7, 10, 14, 21, 30, 45, 60, 90}, TierNames: t10, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_rating_streak", Name: "Rating Streak", Description: "Rate anime every day for {threshold}+ consecutive days", Category: CategoryAnimeStreaks, MaxTier: 10, TierThresholds: []int{3, 7, 14, 21, 30, 45, 60, 90, 120, 180}, TierNames: t10, Triggers: []EvalTrigger{TriggerRatingChange}},
	{Key: "a_multi_ep_streak", Name: "Multi-Episode Streak", Description: "Watch 3+ episodes every day for {threshold}+ days", Category: CategoryAnimeStreaks, MaxTier: 10, TierThresholds: []int{7, 14, 30, 60, 100, 150, 200, 250, 300, 365}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_genre_streak", Name: "Genre Streak", Description: "Watch the same genre for {threshold}+ consecutive days", Category: CategoryAnimeStreaks, MaxTier: 10, TierThresholds: []int{3, 7, 14, 21, 30, 45, 60, 90, 120, 180}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_studio_streak", Name: "Studio Streak", Description: "Watch the same studio's anime for {threshold}+ consecutive days", Category: CategoryAnimeStreaks, MaxTier: 10, TierThresholds: []int{3, 5, 7, 10, 14, 21, 30, 45, 60, 90}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_perfect_week", Name: "Perfect Week", Description: "Watch anime, rate anime, and complete anime all in one week", Category: CategoryAnimeStreaks, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},

	// ═══════════════════════════════════════════════
	// ANIME ADDITIONAL SCORING (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_masterpiece_hunter", Name: "Masterpiece Hunter", Description: "Watch {threshold}+ anime with community score > 9.0", Category: CategoryAnimeScoring, MaxTier: 10, TierThresholds: []int{3, 5, 10, 15, 20, 25, 30, 40, 50, 75}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_contrarian", Name: "Contrarian", Description: "Rate {threshold}+ anime 3+ points below community average", Category: CategoryAnimeScoring, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_optimist", Name: "Optimist", Description: "Rate {threshold}+ anime 2+ points above community average", Category: CategoryAnimeScoring, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_score_distributor", Name: "Score Distributor", Description: "Have at least 5 anime at every score from 1-10", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_genre_critic", Name: "Genre Critic", Description: "Rate 10+ anime in {threshold}+ different genres", Category: CategoryAnimeScoring, MaxTier: 10, TierThresholds: []int{3, 5, 8, 10, 12, 14, 16, 18, 20, 22}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_mean_above_8", Name: "High Standards", Description: "Maintain a mean score above 8.0 with 100+ rated anime", Category: CategoryAnimeScoring, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},

	// ═══════════════════════════════════════════════
	// ANIME ADDITIONAL FORMATS (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_cm_watcher", Name: "CM Watcher", Description: "Watch {threshold}+ commercial anime (CMs)", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_pv_collector", Name: "PV Collector", Description: "Watch {threshold}+ promotional videos/PVs", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 35, 55, 110, 275, 825, 2900}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_format_balance", Name: "Format Balance", Description: "Have at least 5 anime in 3+ different formats", Category: CategoryAnimeFormats, MaxTier: 0, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_episodic_master", Name: "Episodic Master", Description: "Complete {threshold}+ episodic anime (standalone episodes)", Category: CategoryAnimeFormats, MaxTier: 10, TierThresholds: []int{5, 10, 20, 40, 75, 120, 250, 625, 1900, 6500}, TierNames: t10, Triggers: []EvalTrigger{TriggerCollectionRefresh}},
	{Key: "a_sequel_movie", Name: "Sequel Movie", Description: "Watch a sequel movie after completing its TV series", Category: CategoryAnimeFormats, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},
	{Key: "a_recap_watcher", Name: "Recap Watcher", Description: "Watch a recap/summary movie of an anime you completed", Category: CategoryAnimeFormats, MaxTier: 0, Triggers: []EvalTrigger{TriggerSeriesComplete}},

	// ═══════════════════════════════════════════════
	// ANIME ADDITIONAL SOCIAL (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_genre_party", Name: "Genre Party", Description: "Host a watch party with a specific genre theme", Category: CategoryAnimeSocial, MaxTier: 0, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_weekly_party", Name: "Weekly Watch Party", Description: "Host weekly watch parties for {threshold}+ weeks", Category: CategoryAnimeSocial, MaxTier: 10, TierThresholds: []int{4, 8, 12, 20, 30, 40, 52, 78, 104, 156}, TierNames: t10, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_silent_viewer", Name: "Silent Viewer", Description: "Attend a watch party without posting any chat messages", Category: CategoryAnimeSocial, MaxTier: 0, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_recommendation_giver", Name: "Recommendation Giver", Description: "Have {threshold}+ peers watch anime you recommended", Category: CategoryAnimeSocial, MaxTier: 10, TierThresholds: []int{3, 5, 10, 20, 50, 80, 160, 400, 1200, 4200}, TierNames: t10, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_party_completionist", Name: "Party Completionist", Description: "Complete an entire series through watch parties only", Category: CategoryAnimeSocial, MaxTier: 0, Triggers: []EvalTrigger{TriggerNakamaEvent}},
	{Key: "a_social_scorer", Name: "Social Scorer", Description: "Rate anime after discussing it in a watch party", Category: CategoryAnimeSocial, MaxTier: 0, Triggers: []EvalTrigger{TriggerNakamaEvent}},

	// ═══════════════════════════════════════════════
	// ANIME ADDITIONAL HOLIDAY (6 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_earth_day", Name: "Earth Day Watcher", Description: "Watch a nature-themed anime on April 22nd", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_labor_day", Name: "Labor Day Anime", Description: "Watch anime on Labor Day", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_winter_solstice", Name: "Winter Solstice Watch", Description: "Watch anime on December 21st", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_anime_birthday", Name: "Anime Birthday", Description: "Watch anime on the anniversary of your first anime completion", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_every_holiday", Name: "Every Holiday Watcher", Description: "Watch anime on {threshold}+ different recognized holidays in a year", Category: CategoryAnimeHoliday, MaxTier: 10, TierThresholds: []int{3, 5, 7, 10, 12, 14, 16, 18, 20, 25}, TierNames: t10, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
	{Key: "a_consecutive_holidays", Name: "Consecutive Holidays", Description: "Watch anime on 3+ consecutive recognized holidays", Category: CategoryAnimeHoliday, MaxTier: 0, Triggers: []EvalTrigger{TriggerEpisodeProgress}},
}

package achievement

// metaDefinitions contains achievements about the achievement system itself.
// These reward users for engaging with the achievement system.
var metaDefinitions = []Definition{

	// ═══════════════════════════════════════════════
	// ANIME META MASTERY (12 definitions)
	// ═══════════════════════════════════════════════

	{Key: "a_meta_first_unlock", Name: "First Unlock", Description: "Unlock your first anime achievement", Category: CategoryAnimeMeta, MaxTier: 0, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "a_meta_collector", Name: "Achievement Collector", Description: "Unlock {threshold}+ anime achievements", Category: CategoryAnimeMeta, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 300, 400, 500, 600, 750}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "a_meta_category_starter", Name: "Category Starter", Description: "Unlock at least one anime achievement in {threshold}+ categories", Category: CategoryAnimeMeta, MaxTier: 10, TierThresholds: []int{3, 5, 7, 9, 11, 12, 13, 14, 14, 14}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "a_meta_tier_climber", Name: "Tier Climber", Description: "Reach tier 5+ on {threshold}+ different tiered anime achievements", Category: CategoryAnimeMeta, MaxTier: 10, TierThresholds: []int{1, 3, 5, 10, 20, 30, 50, 75, 100, 150}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "a_meta_tier_max", Name: "Maxed Out", Description: "Reach maximum tier on {threshold}+ anime achievements", Category: CategoryAnimeMeta, MaxTier: 10, TierThresholds: []int{1, 3, 5, 10, 20, 30, 50, 75, 100, 150}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "a_meta_xp_earner", Name: "XP Earner", Description: "Earn {threshold}+ total anime XP", Category: CategoryAnimeMeta, MaxTier: 10, TierThresholds: []int{500, 2000, 5000, 15000, 50000, 100000, 250000, 500000, 1000000, 5000000}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "a_meta_difficulty_easy", Name: "Easy Sweep", Description: "Unlock {threshold}+ easy anime achievements", Category: CategoryAnimeMeta, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 75, 100, 125, 150, 200, 250}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "a_meta_difficulty_hard", Name: "Hard Mode", Description: "Unlock {threshold}+ hard or extreme anime achievements", Category: CategoryAnimeMeta, MaxTier: 10, TierThresholds: []int{3, 5, 10, 25, 50, 75, 100, 125, 150, 200}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "a_meta_unlock_spree", Name: "Unlock Spree", Description: "Unlock 5+ anime achievements in a single day", Category: CategoryAnimeMeta, MaxTier: 0, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "a_meta_completionist", Name: "Meta Completionist", Description: "Unlock 90%+ of all anime achievements", Category: CategoryAnimeMeta, MaxTier: 0, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "a_meta_diverse", Name: "Diverse Achiever", Description: "Unlock 10+ achievements in {threshold}+ different anime categories", Category: CategoryAnimeMeta, MaxTier: 10, TierThresholds: []int{3, 5, 7, 9, 11, 12, 13, 14, 14, 14}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "a_meta_dominator", Name: "Anime Dominator", Description: "Unlock every anime achievement", Category: CategoryAnimeMeta, MaxTier: 0, Triggers: []EvalTrigger{TriggerAchievementUnlock}},

	// ═══════════════════════════════════════════════
	// MANGA META MASTERY (12 definitions)
	// ═══════════════════════════════════════════════

	{Key: "m_meta_first_unlock", Name: "First Manga Unlock", Description: "Unlock your first manga achievement", Category: CategoryMangaMeta, MaxTier: 0, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "m_meta_collector", Name: "Manga Achievement Collector", Description: "Unlock {threshold}+ manga achievements", Category: CategoryMangaMeta, MaxTier: 10, TierThresholds: []int{10, 25, 50, 100, 200, 300, 400, 500, 600, 750}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "m_meta_category_starter", Name: "Category Starter Reader", Description: "Unlock at least one manga achievement in {threshold}+ categories", Category: CategoryMangaMeta, MaxTier: 10, TierThresholds: []int{3, 5, 7, 9, 11, 12, 13, 14, 14, 14}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "m_meta_tier_climber", Name: "Tier Climber Reader", Description: "Reach tier 5+ on {threshold}+ different tiered manga achievements", Category: CategoryMangaMeta, MaxTier: 10, TierThresholds: []int{1, 3, 5, 10, 20, 30, 50, 75, 100, 150}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "m_meta_tier_max", Name: "Maxed Out Reader", Description: "Reach maximum tier on {threshold}+ manga achievements", Category: CategoryMangaMeta, MaxTier: 10, TierThresholds: []int{1, 3, 5, 10, 20, 30, 50, 75, 100, 150}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "m_meta_xp_earner", Name: "Manga XP Earner", Description: "Earn {threshold}+ total manga XP", Category: CategoryMangaMeta, MaxTier: 10, TierThresholds: []int{500, 2000, 5000, 15000, 50000, 100000, 250000, 500000, 1000000, 5000000}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "m_meta_difficulty_easy", Name: "Easy Sweep Reader", Description: "Unlock {threshold}+ easy manga achievements", Category: CategoryMangaMeta, MaxTier: 10, TierThresholds: []int{5, 10, 25, 50, 75, 100, 125, 150, 200, 250}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "m_meta_difficulty_hard", Name: "Hard Mode Reader", Description: "Unlock {threshold}+ hard or extreme manga achievements", Category: CategoryMangaMeta, MaxTier: 10, TierThresholds: []int{3, 5, 10, 25, 50, 75, 100, 125, 150, 200}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "m_meta_unlock_spree", Name: "Manga Unlock Spree", Description: "Unlock 5+ manga achievements in a single day", Category: CategoryMangaMeta, MaxTier: 0, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "m_meta_completionist", Name: "Meta Completionist Reader", Description: "Unlock 90%+ of all manga achievements", Category: CategoryMangaMeta, MaxTier: 0, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "m_meta_diverse", Name: "Diverse Achiever Reader", Description: "Unlock 10+ achievements in {threshold}+ different manga categories", Category: CategoryMangaMeta, MaxTier: 10, TierThresholds: []int{3, 5, 7, 9, 11, 12, 13, 14, 14, 14}, TierNames: t10, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
	{Key: "m_meta_dominator", Name: "Manga Dominator", Description: "Unlock every manga achievement", Category: CategoryMangaMeta, MaxTier: 0, Triggers: []EvalTrigger{TriggerAchievementUnlock}},
}

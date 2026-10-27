package achievement

import (
	"math"
	"strings"
)

// Achievements about achievements, measured over the profile's real unlocks of one medium (meta
// achievements themselves excluded).

type metaView struct {
	unlockedRows int
	totalRows    int
	byCategory   map[Category]int
	maxTierHit   int
	tier5Keys    int
	xp           int
	easy         int
	hard         int
	perDay       map[dayKey]int
}

func metaOf(f *Facts, prefix string) *metaView {
	v := &metaView{byCategory: map[Category]int{}, perDay: map[dayKey]int{}}
	defs := DefinitionMap()
	highest := map[string]int{}
	for _, d := range AllDefinitions {
		if !strings.HasPrefix(d.Key, prefix) || isMetaCategory(d.Category) {
			continue
		}
		if d.MaxTier == 0 {
			v.totalRows++
		} else {
			v.totalRows += d.MaxTier
		}
	}
	for _, a := range f.Achievements {
		if !a.IsUnlocked || !strings.HasPrefix(a.Key, prefix) {
			continue
		}
		d := defs[a.Key]
		if d == nil || isMetaCategory(d.Category) {
			continue
		}
		v.unlockedRows++
		v.byCategory[d.Category]++
		if a.Tier > highest[a.Key] || (a.Tier == 0 && highest[a.Key] == 0) {
			highest[a.Key] = a.Tier
		}
		switch d.Difficulty {
		case DifficultyEasy:
			v.easy++
		case DifficultyHard, DifficultyExtreme:
			v.hard++
		}
		if !isNoXPAchievement(d.Key) {
			base := d.XPReward
			if base <= 0 {
				base = DefaultTierXP(a.Tier)
			}
			v.xp += int(math.Round(float64(base) * DifficultyMultiplier(d.Difficulty)))
		}
		if a.UnlockedAt != nil {
			v.perDay[dayOf(a.UnlockedAt.In(f.TZ))]++
		}
	}
	for key, tier := range highest {
		d := defs[key]
		if d.MaxTier > 0 && tier >= 5 {
			v.tier5Keys++
		}
		if d.MaxTier > 0 && tier == d.MaxTier {
			v.maxTierHit++
		}
	}
	return v
}

func isMetaCategory(c Category) bool { return c == CategoryAnimeMeta || c == CategoryMangaMeta }

func init() {
	for _, side := range []struct{ p, prefix string }{{"a_", "a_"}, {"m_", "m_"}} {
		prefix := side.prefix
		k := func(name string) string { return side.p + name }
		reg(k("meta_first_unlock"), func(f *Facts) float64 { return b2f(metaOf(f, prefix).unlockedRows > 0) })
		reg(k("meta_collector"), func(f *Facts) float64 { return float64(metaOf(f, prefix).unlockedRows) })
		reg(k("meta_category_starter"), func(f *Facts) float64 { return float64(len(metaOf(f, prefix).byCategory)) })
		reg(k("meta_tier_climber"), func(f *Facts) float64 { return float64(metaOf(f, prefix).tier5Keys) })
		reg(k("meta_tier_max"), func(f *Facts) float64 { return float64(metaOf(f, prefix).maxTierHit) })
		reg(k("meta_xp_earner"), func(f *Facts) float64 { return float64(metaOf(f, prefix).xp) })
		reg(k("meta_difficulty_easy"), func(f *Facts) float64 { return float64(metaOf(f, prefix).easy) })
		reg(k("meta_difficulty_hard"), func(f *Facts) float64 { return float64(metaOf(f, prefix).hard) })
		reg(k("meta_unlock_spree"), func(f *Facts) float64 {
			for _, n := range metaOf(f, prefix).perDay {
				if n >= 5 {
					return 1
				}
			}
			return 0
		})
		reg(k("meta_completionist"), func(f *Facts) float64 {
			v := metaOf(f, prefix)
			return b2f(v.totalRows > 0 && float64(v.unlockedRows) >= 0.9*float64(v.totalRows))
		})
		reg(k("meta_dominator"), func(f *Facts) float64 {
			v := metaOf(f, prefix)
			return b2f(v.totalRows > 0 && v.unlockedRows >= v.totalRows)
		})
		reg(k("meta_diverse"), func(f *Facts) float64 {
			n := 0
			for _, c := range metaOf(f, prefix).byCategory {
				if c >= 10 {
					n++
				}
			}
			return float64(n)
		})
	}
}

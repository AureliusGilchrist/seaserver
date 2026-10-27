package achievement

import (
	"sort"
	"testing"
)

// Every definition is measured by a rule, and every rule belongs to a definition. This is the test
// that keeps "a third of the achievements can never unlock" from happening again.
func TestEveryDefinitionHasARule(t *testing.T) {
	defined := map[string]bool{}
	var missing []string
	for _, d := range AllDefinitions {
		defined[d.Key] = true
		if rules[d.Key] == nil {
			missing = append(missing, d.Key)
		}
	}
	var orphan []string
	for k := range rules {
		if !defined[k] {
			orphan = append(orphan, k)
		}
	}
	sort.Strings(missing)
	sort.Strings(orphan)
	if len(missing) > 0 {
		t.Errorf("%d definitions have no rule: %v", len(missing), missing)
	}
	if len(orphan) > 0 {
		t.Errorf("%d rules have no definition: %v", len(orphan), orphan)
	}
}

// Rules must not panic on an empty profile.
func TestRulesOnEmptyFacts(t *testing.T) {
	f := buildFacts(&factsInput{})
	for key, r := range rules {
		func() {
			defer func() {
				if p := recover(); p != nil {
					t.Errorf("rule %s panicked on empty facts: %v", key, p)
				}
			}()
			if v := r(f); v != 0 {
				// Nothing has happened yet, so nothing is measured.
				t.Errorf("rule %s = %v on an empty profile, want 0", key, v)
			}
		}()
	}
}

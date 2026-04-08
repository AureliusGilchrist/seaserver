package gojuuon

import (
	"fmt"
	"strings"
	"unicode"
)

// RomajiToGojuuonKey converts a romaji title string into a sortable key
// that follows the 五十音 (GoJuuon / Japanese syllabary) ordering.
//
// The key format is: "NN-<normalized lowercase romaji>"
// where NN is a two-digit GoJuuon row number.
//
// GoJuuon rows:
//
//	00 = あ row (a, i, u, e, o)
//	01 = か row (ka, ki, ku, ke, ko)
//	02 = さ row (sa, shi, si, su, se, so)
//	03 = た row (ta, chi, ti, tsu, tu, te, to)
//	04 = な row (na, ni, nu, ne, no)
//	05 = は row (ha, hi, fu, hu, he, ho)
//	06 = ま row (ma, mi, mu, me, mo)
//	07 = や row (ya, yu, yo)
//	08 = ら row (ra, ri, ru, re, ro)
//	09 = わ row (wa, wi, we, wo, n)
//	10 = が row (ga, gi, gu, ge, go) — voiced か
//	11 = ざ row (za, ji, zi, zu, ze, zo) — voiced さ
//	12 = だ row (da, di, du, de, do) — voiced た
//	13 = ば row (ba, bi, bu, be, bo) — voiced は
//	14 = ぱ row (pa, pi, pu, pe, po) — half-voiced は
//	15 = special / symbols / numbers
func RomajiToGojuuonKey(romaji string) string {
	if romaji == "" {
		return "15-"
	}

	normalized := strings.ToLower(strings.TrimSpace(romaji))

	// Strip leading non-alphabetic chars (e.g., "3-gatsu" → "gatsu", "!!!" → ...)
	stripped := strings.TrimLeftFunc(normalized, func(r rune) bool {
		return !unicode.IsLetter(r)
	})
	if stripped == "" {
		return fmt.Sprintf("15-%s", normalized)
	}

	row := classifyRomajiRow(stripped)
	return fmt.Sprintf("%02d-%s", row, normalized)
}

// classifyRomajiRow determines the GoJuuon row from the first syllable(s)
// of a romanized Japanese word.
func classifyRomajiRow(s string) int {
	if len(s) == 0 {
		return 15
	}

	// Try two-character matches first (longer match wins)
	if len(s) >= 3 {
		tri := s[:3]
		switch tri {
		case "shi", "sha", "sho", "shu":
			return 2 // さ row
		case "chi", "cha", "cho", "chu":
			return 3 // た row
		case "tsu":
			return 3 // た row
		}
	}

	if len(s) >= 2 {
		di := s[:2]
		switch di {
		// か row
		case "ka", "ki", "ku", "ke", "ko":
			return 1
		// さ row
		case "sa", "si", "su", "se", "so":
			return 2
		// た row
		case "ta", "ti", "tu", "te", "to":
			return 3
		// な row
		case "na", "ni", "nu", "ne", "no":
			return 4
		// は row
		case "ha", "hi", "hu", "he", "ho", "fu":
			return 5
		// ま row
		case "ma", "mi", "mu", "me", "mo":
			return 6
		// や row
		case "ya", "yu", "yo":
			return 7
		// ら row
		case "ra", "ri", "ru", "re", "ro":
			return 8
		// わ row
		case "wa", "wi", "we", "wo":
			return 9
		// が row (voiced か)
		case "ga", "gi", "gu", "ge", "go":
			return 10
		// ざ row (voiced さ)
		case "za", "zi", "zu", "ze", "zo", "ji":
			return 11
		// だ row (voiced た)
		case "da", "di", "du", "de", "do":
			return 12
		// ば row (voiced は)
		case "ba", "bi", "bu", "be", "bo":
			return 13
		// ぱ row (half-voiced は)
		case "pa", "pi", "pu", "pe", "po":
			return 14
		}
	}

	// Single-character match
	ch := s[0]
	switch ch {
	case 'a', 'i', 'u', 'e', 'o':
		return 0 // あ row
	case 'n':
		// "n" alone or "n" followed by non-vowel = ん = わ row
		// "na","ni","nu","ne","no" already handled above
		return 9
	case 'k':
		return 1
	case 's':
		return 2
	case 't':
		return 3
	case 'h', 'f':
		return 5
	case 'm':
		return 6
	case 'y':
		return 7
	case 'r', 'l': // 'l' as common romaji variant for ら row
		return 8
	case 'w':
		return 9
	case 'g':
		return 10
	case 'z', 'j':
		return 11
	case 'd':
		return 12
	case 'b':
		return 13
	case 'p':
		return 14
	default:
		return 15
	}
}

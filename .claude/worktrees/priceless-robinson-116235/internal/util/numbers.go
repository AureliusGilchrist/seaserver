package util

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

func StringToInt(str string) (int, bool) {
	dotIndex := strings.IndexByte(str, '.')
	if dotIndex != -1 {
		str = str[:dotIndex]
	}
	i, err := strconv.Atoi(str)
	if err != nil {
		return 0, false
	}
	return i, true
}

func StringToIntMust(str string) int {
	dotIndex := strings.IndexByte(str, '.')
	if dotIndex != -1 {
		str = str[:dotIndex]
	}
	i, err := strconv.Atoi(str)
	if err != nil {
		return 0
	}
	return i
}

func IntegerToRoman(number int) string {
	maxRomanNumber := 3999
	if number > maxRomanNumber {
		return strconv.Itoa(number)
	}

	conversions := []struct {
		value int
		digit string
	}{
		{1000, "M"},
		{900, "CM"},
		{500, "D"},
		{400, "CD"},
		{100, "C"},
		{90, "XC"},
		{50, "L"},
		{40, "XL"},
		{10, "X"},
		{9, "IX"},
		{5, "V"},
		{4, "IV"},
		{1, "I"},
	}

	var roman strings.Builder
	for _, conversion := range conversions {
		for number >= conversion.value {
			roman.WriteString(conversion.digit)
			number -= conversion.value
		}
	}

	return roman.String()
}

// Ordinal returns the ordinal string for a specific integer.
func toOrdinal(number int) string {
	absNumber := int(math.Abs(float64(number)))

	i := absNumber % 100
	if i == 11 || i == 12 || i == 13 {
		return "th"
	}

	switch absNumber % 10 {
	case 1:
		return "st"
	case 2:
		return "nd"
	case 3:
		return "rd"
	default:
		return "th"
	}
}

// IntegerToOrdinal the number by adding the Ordinal to the number.
func IntegerToOrdinal(number int) string {
	return strconv.Itoa(number) + toOrdinal(number)
}

// EvaluateSimpleExpression evaluates a simple arithmetic expression containing
// integers with +, -, *, / operators. Returns the result as an int.
// e.g. "12-11" -> 1, "3+4" -> 7
func EvaluateSimpleExpression(expr string) (int, error) {
	expr = strings.TrimSpace(expr)
	if expr == "" {
		return 0, fmt.Errorf("empty expression")
	}

	// Try plain integer first
	if v, err := strconv.Atoi(expr); err == nil {
		return v, nil
	}

	// Tokenize: split into numbers and operators
	var tokens []string
	current := ""
	for i, ch := range expr {
		if (ch == '+' || ch == '-' || ch == '*' || ch == '/') && i > 0 {
			tokens = append(tokens, strings.TrimSpace(current))
			tokens = append(tokens, string(ch))
			current = ""
		} else {
			current += string(ch)
		}
	}
	if current != "" {
		tokens = append(tokens, strings.TrimSpace(current))
	}

	if len(tokens) < 3 || len(tokens)%2 == 0 {
		return 0, fmt.Errorf("invalid expression: %s", expr)
	}

	// Evaluate left to right (no operator precedence needed for simple expressions)
	result, err := strconv.Atoi(tokens[0])
	if err != nil {
		return 0, fmt.Errorf("invalid number: %s", tokens[0])
	}

	for i := 1; i < len(tokens)-1; i += 2 {
		op := tokens[i]
		right, err := strconv.Atoi(tokens[i+1])
		if err != nil {
			return 0, fmt.Errorf("invalid number: %s", tokens[i+1])
		}
		switch op {
		case "+":
			result += right
		case "-":
			result -= right
		case "*":
			result *= right
		case "/":
			if right == 0 {
				return 0, fmt.Errorf("division by zero")
			}
			result /= right
		default:
			return 0, fmt.Errorf("unknown operator: %s", op)
		}
	}

	return result, nil
}

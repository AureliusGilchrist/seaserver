package util

// GetPreferredTitle returns the title in the priority order: Romaji > English > Native
// This is a generic utility that can be used with any title struct that has Romaji, English, and Native fields
func GetPreferredTitle(title interface {
	GetRomaji() *string
	GetEnglish() *string
	GetNative() *string
}) string {
	if title == nil {
		return ""
	}
	
	// Priority: Romaji > English > Native
	if romaji := title.GetRomaji(); romaji != nil && *romaji != "" {
		return *romaji
	}
	if english := title.GetEnglish(); english != nil && *english != "" {
		return *english
	}
	if native := title.GetNative(); native != nil && *native != "" {
		return *native
	}
	
	return ""
}

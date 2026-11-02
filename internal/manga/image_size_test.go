package manga

import (
	"github.com/davecgh/go-spew/spew"
	_ "image/jpeg" // Register JPEG format
	_ "image/png"  // Register PNG format
	"seanime/internal/test_utils"
	"testing"
)

func TestGetImageNaturalSize(t *testing.T) {
	test_utils.SetTwoLevelDeep()
	test_utils.InitTestProvider(t, test_utils.Network())

	// Test the function
	width, height, err := getImageNaturalSize("https://scans-hot.leanbox.us/manga/One-Piece/1090-001.png")
	if err != nil {
		t.Fatal(err)
	}

	spew.Dump(width, height)
}

package videofile

import (
	"crypto/sha1"
	"encoding/hex"
	"os"
	"strings"
)

func GetHashFromPath(path string) (string, error) {
	h := sha1.New()
	h.Write([]byte(path))

	// For URLs (debrid streams etc.), hash the URL string directly
	// since os.Stat won't work on remote paths.
	if strings.HasPrefix(path, "http://") || strings.HasPrefix(path, "https://") {
		sha := hex.EncodeToString(h.Sum(nil))
		return sha, nil
	}

	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	h.Write([]byte(info.ModTime().String()))
	sha := hex.EncodeToString(h.Sum(nil))
	return sha, nil
}

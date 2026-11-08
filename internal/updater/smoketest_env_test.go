package updater

import "testing"

func TestSmokeTestEnvDropsDataDirs(t *testing.T) {
	got := smokeTestEnv([]string{"PATH=/bin", "SEANIME_DATA_DIR=/home/u/.config/Seanime", "SEANIME_WORKING_DIR=/srv", "HOME=/home/u"})
	if len(got) != 2 || got[0] != "PATH=/bin" || got[1] != "HOME=/home/u" {
		t.Fatalf("got %v", got)
	}
}

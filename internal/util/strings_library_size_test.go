package util

import "testing"

func TestLibrarySize(t *testing.T) {
	cases := map[uint64]string{
		17*(1<<40) + (1<<40)/4: "17.25 TB",
		1 << 40:                "1.00 TB",
		512 * (1 << 30):        "512.00 GB",
	}
	for in, want := range cases {
		if got := LibrarySize(in); got != want {
			t.Errorf("LibrarySize(%d) = %q, want %q", in, got, want)
		}
	}
}

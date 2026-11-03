package nakama

import "testing"

func TestBuildRoomHostWsURLRequiresWSS(t *testing.T) {
	if _, err := buildRoomHostWsURL("ws://relay.example/room/abc", "pw", "1"); err == nil {
		t.Fatal("plain ws:// relay URL should be refused")
	}
	u, err := buildRoomHostWsURL("wss://relay.example/room/abc", "p&w", "1")
	if err != nil {
		t.Fatal(err)
	}
	if u != "wss://relay.example/room/abc?password=p%26w&version=1" {
		t.Fatalf("unexpected URL %s", u)
	}
}

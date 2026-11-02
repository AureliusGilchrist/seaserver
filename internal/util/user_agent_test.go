package util

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"seanime/internal/test_utils"
	"testing"
)

func TestGetOnlineUserAgents(t *testing.T) {
	test_utils.SetTwoLevelDeep()
	test_utils.InitTestProvider(t, test_utils.Network())

	userAgents, err := getOnlineUserAgents()
	if err != nil {
		t.Fatalf("Failed to get online user agents: %v", err)
	}
	t.Logf("Online user agents: %v", userAgents)
}

// TestTransformUserAgentJsonlToSliceFile is a generator, not a test: it overwrites user_agent_list.go
// from data/user_agents.jsonl. Run it on purpose with SEANIME_GENERATE_USER_AGENTS=1.
func TestTransformUserAgentJsonlToSliceFile(t *testing.T) {
	if os.Getenv("SEANIME_GENERATE_USER_AGENTS") != "1" {
		t.Skip("generator; set SEANIME_GENERATE_USER_AGENTS=1 to rewrite user_agent_list.go")
	}

	jsonlFilePath := filepath.Join("data", "user_agents.jsonl")

	jsonlFile, err := os.Open(jsonlFilePath)
	if err != nil {
		t.Fatalf("Failed to open JSONL file: %v", err)
	}
	defer jsonlFile.Close()

	sliceFilePath := filepath.Join("user_agent_list.go")
	sliceFile, err := os.Create(sliceFilePath)
	if err != nil {
		t.Fatalf("Failed to create slice file: %v", err)
	}
	defer sliceFile.Close()

	sliceFile.WriteString("package util\n\nvar UserAgentList = []string{\n")

	type UserAgent struct {
		UserAgent string `json:"useragent"`
	}

	scanner := bufio.NewScanner(jsonlFile)
	for scanner.Scan() {
		line := scanner.Text()
		var ua UserAgent
		if err := json.Unmarshal([]byte(line), &ua); err != nil {
			t.Fatalf("Failed to unmarshal line: %v", err)
		}
		sliceFile.WriteString(fmt.Sprintf("\t\"%s\",\n", ua.UserAgent))
	}
	sliceFile.WriteString("}\n")

	if err := scanner.Err(); err != nil {
		t.Fatalf("Failed to read JSONL file: %v", err)
	}

	t.Logf("User agent list generated successfully: %s", sliceFilePath)
}

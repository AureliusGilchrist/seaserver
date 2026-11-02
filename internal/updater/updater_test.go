package updater

import (
	"seanime/internal/test_utils"
	"seanime/internal/util"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestUpdater_GetLatestUpdateShouldFallback(t *testing.T) {
	test_utils.SetTwoLevelDeep()
	test_utils.InitTestProvider(t, test_utils.Network())
	defer func(prev string) { websiteUrl = prev }(websiteUrl)
	websiteUrl = "https://seanime.app/api/releases" // simulate dead endpoint

	u := New("2.0.2", util.NewLogger(), nil)
	// update channel is "github"

	update, err := u.GetLatestUpdate()
	require.NoError(t, err)

	util.Spew(update)
	require.NotNilf(t, update, "update should contain the latest release")
}

func TestUpdater_GetLatestUpdateSeanime(t *testing.T) {
	test_utils.SetTwoLevelDeep()
	test_utils.InitTestProvider(t, test_utils.Network())
	defer func(prev string) { websiteUrl = prev }(websiteUrl)
	websiteUrl = "https://seanime.app/api/releases" // simulate dead endpoint

	u := New("2.0.2", util.NewLogger(), nil)

	update, err := u.GetLatestUpdate()
	require.NoError(t, err)

	util.Spew(update)
	require.NotNilf(t, update, "update should contain the latest release")
}

func TestUpdater_GetLatestUpdate(t *testing.T) {
	test_utils.SetTwoLevelDeep()
	test_utils.InitTestProvider(t, test_utils.Network())
	u := New("2.0.2", util.NewLogger(), nil)
	u.UpdateChannel = "seanime"

	update, err := u.GetLatestUpdate()
	require.NoError(t, err)

	util.Spew(update)
	require.NotNilf(t, update, "update should contain the latest release")
}

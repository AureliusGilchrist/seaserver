//go:build windows

package updater

import "errors"

// syscallExecImpl has no equivalent on Windows: a running executable's image cannot be replaced
// under the process. The auto-updater's swap is a Unix (NAS) mechanism, and on Windows it reports
// what actually happened rather than pretending.
func syscallExecImpl(path string, args []string, env []string) error {
	return errors.New("restarting in place is not supported on Windows — restart the server manually to pick up the update")
}

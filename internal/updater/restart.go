package updater

import (
	"os"
	"path/filepath"
)

// RestartInPlace replaces the running process with a fresh start of the same binary, with the same
// arguments, working directory and environment: the same swap the git updater makes after a build,
// without a new binary. Used by the memory watchdog. It only returns on failure.
func RestartInPlace() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	if resolved, err := filepath.EvalSymlinks(exe); err == nil {
		exe = resolved
	}
	args := append([]string(nil), os.Args...)
	if len(args) == 0 {
		args = []string{exe}
	} else {
		args[0] = exe
	}
	return syscallExec(exe, args, os.Environ())
}

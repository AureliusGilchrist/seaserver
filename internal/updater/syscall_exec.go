//go:build !windows

package updater

import "syscall"

// syscallExecImpl replaces the running process with the binary at path. Same pid, same working
// directory, new image — the one way to restart when nothing outside is watching the process.
// Unix only; the platforms without syscall.Exec (Windows) do not build this file.
func syscallExecImpl(path string, args []string, env []string) error {
	return syscall.Exec(path, args, env)
}

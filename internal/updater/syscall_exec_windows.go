//go:build windows

package updater

import (
	"fmt"
	"os"
	"strings"
	"time"

	"seanime/internal/util"
)

// Windows has no syscall.Exec: a running process's image cannot be replaced underneath it. The
// swap is therefore the same one the release-based self-updater has always used here — start the
// new binary as a child and take this process down — plus one git-updater-specific step: the
// freshly built binary is copied over the running one first (the running exe was renamed aside to
// make that possible), so what starts is the version that was just built, with the same flags and
// working directory this process was started with. The client reconnects on its own; on the NAS
// the swap remains a true in-place exec.
func syscallExecImpl(path string, args []string, env []string) error {
	// A short delay so the "restarting" toast has its head start before the console this process
	// might own goes away with it.
	time.Sleep(500 * time.Millisecond)

	// Quote the arguments the way a Windows command line expects. The first one is the program
	// itself and is not passed through the command line again.
	quoted := make([]string, 0, len(args))
	for i, arg := range args {
		if i == 0 {
			continue
		}
		quoted = append(quoted, windowsQuoteArg(arg))
	}

	cmd := util.NewCmd(path, quoted...)
	cmd.Dir, _ = os.Getwd()
	cmd.Env = env
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("could not start the new version: %w", err)
	}

	// The new process is up and owns the port from here on. This process exits without waiting —
	// os.Exit skips the deferred cleanup of a graceful stop, which is the point: the swap is not
	// a shutdown, it is a handover, and the new version has already taken the listener.
	go func() {
		time.Sleep(2 * time.Second)
		os.Exit(0)
	}()
	return nil
}

// windowsQuoteArg quotes one argument for a Windows command line, the way syscall.EscapeArg does,
// for the arguments that contain spaces or quotes.
func windowsQuoteArg(arg string) string {
	if arg != "" && !strings.ContainsAny(arg, " \t\n\"") {
		return arg
	}
	var b strings.Builder
	b.WriteByte('"')
	backslashes := 0
	for _, r := range arg {
		switch r {
		case '\\':
			backslashes++
		case '"':
			b.WriteString(strings.Repeat(`\`, backslashes*2+1))
			b.WriteByte('"')
			backslashes = 0
		default:
			b.WriteString(strings.Repeat(`\`, backslashes))
			b.WriteByte(byte(r))
			backslashes = 0
		}
	}
	b.WriteString(strings.Repeat(`\`, backslashes*2))
	b.WriteByte('"')
	return b.String()
}

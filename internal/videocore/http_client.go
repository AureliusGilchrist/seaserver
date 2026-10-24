package videocore

import (
	"time"

	"github.com/imroc/req/v3"
)

// sharedClient is the one req client for the videocore package. Call sites used to build a
// fresh client per request; a dropped client's idle HTTP/2 connections are never closed — their
// read loops keep waiting for server frames — so every call left a socket, a file descriptor and
// a goroutine behind. One shared client pools its connections instead.
var sharedClient = req.C().SetTimeout(30 * time.Second)

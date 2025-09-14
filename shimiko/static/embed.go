package static

import (
	"embed"
	"io/fs"
)

//go:embed index.html
var Files embed.FS

// FileSystem returns the embedded filesystem for use with Echo static middleware
func FileSystem() fs.FS {
	return Files
}
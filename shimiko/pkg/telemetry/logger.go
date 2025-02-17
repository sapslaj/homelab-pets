package telemetry

import (
	"log/slog"
	"os"
)

var DefaultLogger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
	AddSource: true,
}))

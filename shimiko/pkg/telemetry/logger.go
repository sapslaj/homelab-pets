package telemetry

import (
	"context"
	"log/slog"
	"os"
)

var DefaultLogger = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
	AddSource: true,
}))

const LoggerContextKey ContextKey = "sapslaj.shimiko.logger"

func ContextWithLogger(ctx context.Context, logger *slog.Logger) context.Context {
	if ctx == nil {
		ctx = context.TODO()
	}
	if logger == nil {
		logger = DefaultLogger.With()
	}
	return context.WithValue(ctx, LoggerContextKey, logger)
}

func LoggerFromContext(ctx context.Context) *slog.Logger {
	if ctx == nil {
		ctx = context.TODO()
	}
	logger, ok := ctx.Value(LoggerContextKey).(*slog.Logger)
	if ok {
		return logger
	}
	return DefaultLogger.With(
		"telemetry.warning",
		"telemetry.LoggerFromContext did not find a logger in the given context",
	)
}

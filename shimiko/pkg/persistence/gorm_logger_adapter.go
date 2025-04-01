package persistence

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	gorm_logger "gorm.io/gorm/logger"
)

type GormLoggerAdapter struct {
	Logger *slog.Logger
}

func (adapter *GormLoggerAdapter) LogMode(level gorm_logger.LogLevel) gorm_logger.Interface {
	return adapter
}

func (adapter *GormLoggerAdapter) Info(ctx context.Context, msg string, data ...any) {
	adapter.Logger.InfoContext(ctx, fmt.Sprintf(msg, data...))
}

func (adapter *GormLoggerAdapter) Warn(ctx context.Context, msg string, data ...any) {
	adapter.Logger.WarnContext(ctx, fmt.Sprintf(msg, data...))
}

func (adapter *GormLoggerAdapter) Error(ctx context.Context, msg string, data ...any) {
	adapter.Logger.ErrorContext(ctx, fmt.Sprintf(msg, data...))
}

func (adapter *GormLoggerAdapter) Trace(ctx context.Context, begin time.Time, fc func() (sql string, rowsAffected int64), err error) {
	elapsed := time.Since(begin)
	logger := adapter.Logger.With(
		"begin", begin,
		"elapsed", elapsed,
	)
	if err != nil {
		logger = logger.With("error", err)
	}
	sql, rows := fc()
	adapter.Logger.InfoContext(ctx, "SQL", "sql", sql, "rows", rows)
}

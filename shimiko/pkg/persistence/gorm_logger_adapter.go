package persistence

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	gorm_logger "gorm.io/gorm/logger"
)

type gormLoggerAdapter struct {
	logger *slog.Logger
}

func (adapter *gormLoggerAdapter) LogMode(level gorm_logger.LogLevel) gorm_logger.Interface {
	return adapter
}

func (adapter *gormLoggerAdapter) Info(ctx context.Context, msg string, data ...any) {
	adapter.logger.InfoContext(ctx, fmt.Sprintf(msg, data...))
}

func (adapter *gormLoggerAdapter) Warn(ctx context.Context, msg string, data ...any) {
	adapter.logger.WarnContext(ctx, fmt.Sprintf(msg, data...))
}

func (adapter *gormLoggerAdapter) Error(ctx context.Context, msg string, data ...any) {
	adapter.logger.ErrorContext(ctx, fmt.Sprintf(msg, data...))
}

func (adapter *gormLoggerAdapter) Trace(ctx context.Context, begin time.Time, fc func() (sql string, rowsAffected int64), err error) {
	elapsed := time.Since(begin)
	logger := adapter.logger.With(
		"begin", begin,
		"elapsed", elapsed,
	)
	if err != nil {
		logger = logger.With("error", err)
	}
	sql, rows := fc()
	adapter.logger.InfoContext(ctx, "SQL", "sql", sql, "rows", rows)
}

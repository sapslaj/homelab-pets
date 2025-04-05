package persistence

import (
	"context"
	"fmt"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/env"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
)

func OpenDB(ctx context.Context) (*gorm.DB, error) {
	databasePath := env.MustGetDefault("SHIMIKO_DATABASE_PATH", "./shimiko.sqlite3")
	logger := telemetry.LoggerFromContext(ctx).With(
		"database_path", databasePath,
	)
	logger.InfoContext(ctx, "opening database")
	db, err := gorm.Open(sqlite.Open(databasePath), &gorm.Config{
		Logger: &GormLoggerAdapter{
			Logger: logger,
		},
	})
	if err != nil {
		logger.ErrorContext(ctx, "error opening database", "error", err)
		return nil, fmt.Errorf("error opening database: %w", err)
	}

	logger.InfoContext(ctx, "migrating database")
	err = db.AutoMigrate(&DNSRecord{})
	if err != nil {
		logger.ErrorContext(ctx, "error running migrations", "error", err)
		return db, fmt.Errorf("error running migrations: %w", err)
	}
	return db, nil
}

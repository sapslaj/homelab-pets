package persistence

import (
	"context"
	"fmt"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/plugin/opentelemetry/tracing"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/env"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
)

func OpenDB(ctx context.Context) (*gorm.DB, error) {
	ctx, span := telemetry.Tracer.Start(ctx, "shimiko/pkg/persistence.OpenDB", trace.WithAttributes())
	defer span.End()

	databasePath := env.MustGetDefault("SHIMIKO_DATABASE_PATH", "./shimiko.sqlite3")
	logger := telemetry.LoggerFromContext(ctx).With(
		"database_path", databasePath,
	)

	span.SetAttributes(attribute.String("database_path", databasePath))

	logger.InfoContext(ctx, "opening database")
	db, err := gorm.Open(sqlite.Open(databasePath), &gorm.Config{
		Logger: &GormLoggerAdapter{
			Logger: logger,
		},
	})
	if err != nil {
		logger.ErrorContext(ctx, "error opening database", "error", err)
		err = fmt.Errorf("error opening database: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return db, err
	}

	err = db.Use(tracing.NewPlugin())
	if err != nil {
		logger.ErrorContext(ctx, "error configuring gorm tracing plugin", "error", err)
		err = fmt.Errorf("error configuring gorm tracing plugin: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return db, err
	}

	logger.InfoContext(ctx, "migrating database")
	err = db.AutoMigrate(&DNSRecord{})
	if err != nil {
		logger.ErrorContext(ctx, "error running migrations", "error", err)
		err = fmt.Errorf("error running migrations: %w", err)
		span.SetStatus(codes.Error, err.Error())
		return db, err
	}

	span.SetStatus(codes.Ok, "")
	return db, nil
}

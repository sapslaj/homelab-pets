package persistence

import (
	"log/slog"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/env"
)

const DomainName = "sapslaj.xyz"

type Persistence struct {
	DB           *gorm.DB
	parentLogger *slog.Logger
}

func NewPersistence(parentLogger *slog.Logger) (*Persistence, error) {
	databasePath := env.GetDefault("SHIMIKO_DATABASE_PATH", ":memory:")
	logger := parentLogger.With(
		"database_path", databasePath,
	)
	logger.Info("opening database")
	db, err := gorm.Open(sqlite.Open(databasePath), &gorm.Config{
		Logger: &gormLoggerAdapter{
			logger: logger,
		},
	})
	if err != nil {
		return nil, err
	}

	logger.Info("migrating database")
	db.AutoMigrate(&DNSRecord{})

	p := &Persistence{
		DB:           db,
		parentLogger: logger,
	}

	return p, nil
}

func (p *Persistence) logger() *slog.Logger {
	return p.parentLogger.With()
}

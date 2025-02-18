package persistence

import (
	"context"
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

type PersistenceSession struct {
	DB           *gorm.DB
	parentLogger *slog.Logger
	CoreDNS      *CoreDNS
	Route53      *Route53
}

func (p *Persistence) NewSession(ctx context.Context) (*PersistenceSession, error) {
	ps := &PersistenceSession{
		DB: p.DB,
		parentLogger: p.parentLogger,
	}

	var err error
	ps.CoreDNS, err = LoadCoreDNS(ctx)
	if err != nil {
		return ps, err
	}

	ps.Route53, err = NewRoute53(ctx)
	if err != nil {
		return ps, err
	}
	ps.Route53.StartChangeBatch()

	return ps, nil
}

func (ps *PersistenceSession) Finish(ctx context.Context) error {
	err := ps.CoreDNS.Save(ctx)
	if err != nil {
		return err
	}
	_, err = ps.Route53.FlushChangeBatch(ctx)
	if err != nil {
		return err
	}
	return nil
}

package main

import (
	"os"

	"github.com/spf13/cobra"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/persistence"
	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
)

func Sync(cmd *cobra.Command, args []string) {
	logger := telemetry.DefaultLogger.With("cmd", "sync")
	ctx := telemetry.ContextWithLogger(cmd.Context(), logger)

	fatal := func(msg string, err error) {
		if err != nil {
			logger.ErrorContext(ctx, msg, "error", err)
		} else {
			logger.ErrorContext(ctx, msg)
		}
		os.Exit(1)
	}

	db, err := persistence.OpenDB(ctx)
	if err != nil {
		fatal("failed to open DB", err)
	}
	ps, err := persistence.NewSession(ctx, db)
	if err != nil {
		fatal("failed to create persistence session", err)
	}
	defer func() {
		err := ps.Finish(ctx)
		if err != nil {
			fatal("failed to clean up persistence session", err)
		}
	}()

	var records []*persistence.DNSRecord
	query := ps.DB.Find(&records)
	if query.Error != nil {
		fatal("failed to query records", query.Error)
	}

	failed := false
	for _, record := range records {
		recordLogger := logger.With("record", record)
		recordLogger.InfoContext(ctx, "upserting CoreDNS")
		err := ps.CoreDNS.UpsertRecord(ctx, record, nil)
		if err != nil {
			failed = true
			recordLogger.ErrorContext(ctx, "failed to upsert CoreDNS", "error", err)
		}
		recordLogger.InfoContext(ctx, "upserting Route53")
		err = ps.Route53.UpsertRecord(ctx, record, nil)
		if err != nil {
			failed = true
			recordLogger.ErrorContext(ctx, "failed to upsert Route53", "error", err)
		}
	}

	if failed {
		fatal("failed upserting some records", nil)
	}
}

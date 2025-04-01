package main

import (
	"os"

	"github.com/spf13/cobra"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
	"github.com/sapslaj/homelab-pets/shimiko/server"
)

func Server(cmd *cobra.Command, args []string) {
	logger := telemetry.DefaultLogger.With("cmd", "server")
	ctx := telemetry.ContextWithLogger(cmd.Context(), logger)
	server, err := server.NewServer(ctx)
	if err != nil {
		logger.Error("error initializing server", "err", err)
		os.Exit(1)
	}
	err = server.Run()
	if err != nil {
		logger.Error("error starting server", "err", err)
		os.Exit(1)
	}
}

package main

import (
	"os"

	"github.com/spf13/cobra"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
	"github.com/sapslaj/homelab-pets/shimiko/server"
)

func main() {
	rootCmd := &cobra.Command{
		Use: "shimiko",
	}
	rootCmd.Flags().BoolP("toggle", "t", false, "Help message for toggle")

	rootCmd.AddCommand(
		&cobra.Command{
			Use: "server",
			Run: func(cmd *cobra.Command, args []string) {
				server, err := server.NewServer()
				if err != nil {
					telemetry.DefaultLogger.Error("error initializing server", "err", err)
					os.Exit(1)
				}
				err = server.Run(cmd.Context())
				if err != nil {
					telemetry.DefaultLogger.Error("error starting server", "err", err)
					os.Exit(1)
				}
			},
		},
	)

	rootCmd.AddCommand(
		&cobra.Command{
			Use: "sync",
			Run: sync,
		},
	)

	err := rootCmd.Execute()
	if err != nil {
		telemetry.DefaultLogger.Error("error executing command", "err", err)
		os.Exit(1)
	}
}

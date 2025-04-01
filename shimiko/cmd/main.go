package main

import (
	"os"

	"github.com/spf13/cobra"

	"github.com/sapslaj/homelab-pets/shimiko/pkg/telemetry"
)

func main() {
	rootCmd := &cobra.Command{
		Use: "shimiko",
	}
	rootCmd.Flags().BoolP("toggle", "t", false, "Help message for toggle")

	rootCmd.AddCommand(
		&cobra.Command{
			Use: "server",
			Run: Server,
		},
	)

	rootCmd.AddCommand(
		&cobra.Command{
			Use: "sync",
			Run: Sync,
		},
	)

	err := rootCmd.Execute()
	if err != nil {
		telemetry.DefaultLogger.Error("error executing command", "err", err)
		os.Exit(1)
	}
}

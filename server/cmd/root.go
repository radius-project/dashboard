// ------------------------------------------------------------
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.
// ------------------------------------------------------------

package cmd

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/go-logr/logr"
	"github.com/project-radius/dashboard/server/pkg/dashboard"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "dashboard",
	Short: "Run the Radius dashboard",
	Long:  `Run the Radius dashboard`,
	RunE: func(cmd *cobra.Command, args []string) error {
		logger := logr.Discard()

		ctx := logr.NewContext(context.Background(), logger)
		ctx, cancel := context.WithCancel(ctx)
		defer cancel()

		port, err := cmd.Flags().GetString("port")
		if err != nil {
			return err
		}

		useLocal, err := cmd.Flags().GetBool("local")
		if err != nil {
			return err
		}

		options, err := dashboard.NewServerOptionsFromFlags(port, useLocal)
		if err != nil {
			return err
		}

		host, err := dashboard.NewServer(options)
		if err != nil {
			return err
		}

		stopped, serviceErrors := host.RunAsync(ctx)

		exitCh := make(chan os.Signal, 2)
		signal.Notify(exitCh, os.Interrupt, syscall.SIGTERM)

		select {
		// Shutdown triggered
		case <-exitCh:
			logger.Info("Shutting down....")
			cancel()

		// A service terminated with a failure. Shut down
		case <-serviceErrors:
			logger.Info("Error occurred - shutting down....")
			cancel()
		}

		// Finished shutting down. An error returned here is a failure to terminate
		// gracefully, so just crash if that happens.
		err = <-stopped
		if err == nil {
			os.Exit(0)
		} else {
			panic(err)
		}

		return nil
	},
}

func init() {
	rootCmd.Flags().StringP("port", "p", "8080", "Server port")
	rootCmd.Flags().Bool("local", false, "Use a local server")
}

func Execute() {
	cobra.CheckErr(rootCmd.Execute())
}

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
	"github.com/project-radius/radius/pkg/dashboard"
	"github.com/project-radius/radius/pkg/ucp/ucplog"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "dashboard",
	Short: "Run the Radius dashboard",
	Long:  `Run the Radius dashboard`,
	RunE: func(cmd *cobra.Command, args []string) error {
		logger := ucplog.NewLogger()
		ctx := logr.NewContext(cmd.Context(), logger)
		ctx, cancel := context.WithCancel(ctx)
		defer cancel()

		options, err := dashboard.NewServerOptionsFromEnvironment()
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

func Execute() {
	cobra.CheckErr(rootCmd.Execute())
}

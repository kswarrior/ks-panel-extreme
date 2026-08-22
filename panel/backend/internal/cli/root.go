package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// rootCmd is the base command when called without any subcommands.
var rootCmd = &cobra.Command{
	Use:   "kspanel",
	Short: "kspanel – a simple panel for managing instances",
}

// Execute adds all child commands to the root command and sets flags appropriately.
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.AddCommand(seedCmd)
	rootCmd.AddCommand(launchCmd)
	rootCmd.AddCommand(stopCmd)
	rootCmd.AddCommand(createUserCmd)
	rootCmd.AddCommand(importTemplateCmd)
	rootCmd.AddCommand(setupLocalnodeCmd)
}

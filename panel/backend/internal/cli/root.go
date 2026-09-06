package cli

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/example/kspanel/internal/version"
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

// versionCmd prints the panel build identity from version.Snapshot().
var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "Print the panel build version",
	RunE:  runVersion,
}

func runVersion(cmd *cobra.Command, args []string) error {
	asJSON, err := cmd.Flags().GetBool("json")
	if err != nil {
		return err
	}
	info := version.Snapshot()
	if asJSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetEscapeHTML(false)
		return enc.Encode(info)
	}
	fmt.Printf("kspanel %s (commit %s, built %s)\n", info.Version, info.Commit, info.BuildDate)
	return nil
}

func init() {
	versionCmd.Flags().Bool("json", false, "Output version as JSON")
	rootCmd.AddCommand(versionCmd)
	rootCmd.AddCommand(seedCmd)
	rootCmd.AddCommand(launchCmd)
	rootCmd.AddCommand(stopCmd)
	rootCmd.AddCommand(createUserCmd)
	rootCmd.AddCommand(importTemplateCmd)
	rootCmd.AddCommand(setupLocalnodeCmd)
}

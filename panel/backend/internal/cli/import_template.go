package cli

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/example/kspanel/internal/cli/print"
	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/repository"
	"github.com/spf13/cobra"
)

// importTemplateCmd: `kspanel import:template <name>`
//
// Drops one of the canned, code-owned blueprints (see builtinTemplates) into
// the database so it shows up on the admin Templates page without the
// operator having to hand-write the JSON spec. Re-importing the same name
// updates the existing row in place — so bumping a builtin's spec in code and
// re-running the command fixes every panel without orphaning rows.
//
// Examples:
//   kspanel import:template minecraft
//   kspanel import:template --list
var importTemplateCmd = &cobra.Command{
	Use:   "import:template [name]",
	Short: "Import a built-in template into the database",
	Long: `Import a built-in template into the database.

A template is a reusable deploy blueprint (docker/lxd/kvm/multipass). This
command seeds one of the canned templates shipped with the panel so it
appears on the admin Templates page. Re-importing the same name updates the
existing row in place.

Run with --list to see every built-in template you can import.

Examples:
  kspanel import:template minecraft
  kspanel import:template --list`,
	Args: cobra.MaximumNArgs(1),
	RunE: runImportTemplate,
}

var importTemplateList bool

func init() {
	importTemplateCmd.Flags().BoolVarP(&importTemplateList, "list", "l", false, "List available built-in templates")
}

func runImportTemplate(cmd *cobra.Command, args []string) error {
	// `--list` short-circuits: print the catalog keys + names + kinds and exit
	// without touching the DB. Useful for discovering what's importable on a
	// given panel build without grepping source.
	if importTemplateList {
		fmt.Println("Available built-in templates:")
		keys := make([]string, 0, len(builtinTemplates))
		byKey := make(map[string]builtinTemplate, len(builtinTemplates))
		for _, t := range builtinTemplates {
			keys = append(keys, t.Key)
			byKey[t.Key] = t
		}
		sort.Strings(keys)
		for _, k := range keys {
			t := byKey[k]
			fmt.Printf("  %-18s %-10s %s\n", t.Key, t.Kind, t.Name)
		}
		return nil
	}

	// Without a name we can't import anything — point the operator at --list
	// rather than printing a bare usage line that hides the catalog.
	if len(args) == 0 {
		print.Fail("import:template", "a template name is required (try --list)")
		return fmt.Errorf("template name is required")
	}

	key := strings.TrimSpace(args[0])
	builtin := findBuiltinTemplate(key)
	if builtin == nil {
		print.Fail("import:template", fmt.Sprintf("no built-in template named %q", key))
		// Echo the available keys so the typo is obvious.
		keys := make([]string, 0, len(builtinTemplates))
		for _, t := range builtinTemplates {
			keys = append(keys, t.Key)
		}
		sort.Strings(keys)
		fmt.Fprintf(cmd.OutOrStderr(), "available: %s\n", strings.Join(keys, ", "))
		return fmt.Errorf("unknown built-in template: %s", key)
	}

	// Validate the canned spec is well-formed JSON before touching the DB so
	// a bad edit to builtinTemplates fails loudly here rather than at the
	// first deploy. This mirrors the admin API's validateTemplate path.
	var probe any
	if err := json.Unmarshal([]byte(builtin.Spec), &probe); err != nil {
		print.Fail("spec", "built-in spec is not valid JSON: "+err.Error())
		return fmt.Errorf("built-in spec invalid: %w", err)
	}

	cfg := config.DatabaseConfig()
	dbPath := cfg.DSN

	// Same log-silencing rule as `launch`/`seed`/`create:user`: the migration
	// loader emits per-step lines that are noise in the optimistic style.
	silenceStandardLog()
	defer restoreStandardLog()

	con, d, err := db.Open(cfg)
	if err != nil {
		print.Fail("import:template", fmt.Sprintf("open db: %v", err))
		return fmt.Errorf("open db: %w", err)
	}
	defer con.Close()

	// Make sure the schema exists even if `seed` was never run — otherwise the
	// templates table would be missing and the INSERT would blow up.
	print.Step("database", dbPath)
	if err := db.RunMigrations(d, con); err != nil {
		print.Fail("migrations", err.Error())
		return fmt.Errorf("run migrations: %w", err)
	}
	if err := db.SeedCore(d, con); err != nil {
		print.Fail("seed", err.Error())
		return fmt.Errorf("seed core data: %w", err)
	}
	print.OK("ready", "schema present")

	repo := repository.NewTemplateRepository(con)
	in := repository.TemplateInput{
		Name:        builtin.Name,
		Description: builtin.Description,
		Kind:        builtin.Kind,
		Image:       builtin.Image,
		Spec:        builtin.Spec,
	}

	print.Step("template", fmt.Sprintf("%s (%s, %s)", builtin.Name, builtin.Kind, builtin.Image))

	// Idempotent: if a row with the same name already exists (a previous
	// import), update it in place so a re-import reflects any spec tweaks in
	// the catalog instead of creating a duplicate.
	if existing, gerr := repo.GetByName(builtin.Name); gerr == nil && existing != nil {
		if err := repo.Update(existing.ID, in); err != nil {
			print.Fail("import:template", fmt.Sprintf("update: %v", err))
			return fmt.Errorf("update template: %w", err)
		}
		print.OK("updated", fmt.Sprintf("id %d (re-imported built-in %q)", existing.ID, builtin.Key))
		return nil
	}

	id, err := repo.Create(in)
	if err != nil {
		print.Fail("import:template", fmt.Sprintf("create: %v", err))
		return fmt.Errorf("create template: %w", err)
	}
	print.OK("imported", fmt.Sprintf("id %d (built-in %q)", id, builtin.Key))
	return nil
}

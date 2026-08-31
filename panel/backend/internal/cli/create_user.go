package cli

import (
	"bufio"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/cli/print"
	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/db"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/spf13/cobra"
)

// roleOptions maps the user-facing role number to its canonical role name.
//   1 -> admin
//   2 -> moderator
//   3 -> user
var roleOptions = []struct {
	Number int
	Name   string
	Label  string
}{
	{1, "admin", "Admin"},
	{2, "moderator", "Moderator"},
	{3, "user", "User"},
}

var (
	createUserUsername string
	createUserEmail    string
	createUserPassword string
	createUserRole     int
)

var createUserCmd = &cobra.Command{
	Use:   "create:user",
	Short: "Create a new user account (interactively or via flags)",
	Long: `Create a new user account.

Examples:
  kspanel create:user
  kspanel create:user --username kshosting --email kshosting@ksmail.com --password kshosting@55 --role 1`,
	RunE: runCreateUser,
}

func init() {
	createUserCmd.Flags().StringVarP(&createUserUsername, "username", "u", "", "Username for the new account")
	createUserCmd.Flags().StringVarP(&createUserEmail, "email", "e", "", "Email for the new account")
	createUserCmd.Flags().StringVarP(&createUserPassword, "password", "p", "", "Password for the new account (min 8 chars)")
	createUserCmd.Flags().IntVarP(&createUserRole, "role", "r", 0, "Role number: 1=Admin, 2=Moderator, 3=User")
}

// resolveRoleName returns the canonical role name for the given option number.
// It returns an error when the number does not match any defined option.
func resolveRoleName(choice int) (string, error) {
	for _, opt := range roleOptions {
		if opt.Number == choice {
			return opt.Name, nil
		}
	}
	return "", fmt.Errorf("invalid role selection %d (expected 1=Admin, 2=Moderator, 3=User)", choice)
}

// runCreateUser creates a new user. Anything not provided via the corresponding
// flag is prompted for interactively, preserving the original interactive flow.
//
// Output follows the same optimistic step / OK pattern used by `seed` so the
// operator sees a single, predictable log: every value is echoed on a
// "→" line, and the final "✓ user created" outcome caps the block.
func runCreateUser(cmd *cobra.Command, args []string) error {
	cfg := config.DatabaseConfig()
	dbPath := cfg.DSN

	// Same log-silencing rule as `launch` and `seed`: the migration
	// loader writes per-step log lines that are noise during the
	// optimistic style unless KSPANEL_LOG=verbose is set.
	silenceStandardLog()
	defer restoreStandardLog()

	con, d, err := db.Open(cfg)
	if err != nil {
		print.Fail("create:user", fmt.Sprintf("open db: %v", err))
		return fmt.Errorf("open db: %w", err)
	}
	defer con.Close()

	// Make sure the schema and base roles exist even if `seed` was never run.
	// We print the same step/OK block a fresh `seed` would, so an operator
	// who runs `create:user` on a clean machine sees what's happening.
	print.Step("database", dbPath)
	if err := db.RunMigrations(d, con); err != nil {
		print.Fail("migrations", err.Error())
		return fmt.Errorf("run migrations: %w", err)
	}
	if err := db.SeedCore(d, con); err != nil {
		print.Fail("seed", err.Error())
		return fmt.Errorf("seed core data: %w", err)
	}
	print.OK("ready", "schema + roles present")

	repo := repository.NewUserRepository(con)
	roleRepo := repository.NewRoleRepository(con)

	reader := bufio.NewReader(os.Stdin)

	// Username
	username := strings.TrimSpace(createUserUsername)
	if username == "" {
		fmt.Print("Username: ")
		line, err := reader.ReadString('\n')
		if err != nil {
			return err
		}
		username = strings.TrimSpace(line)
	}

	// Email with validation loop
	email := strings.TrimSpace(createUserEmail)
	if email == "" {
		for {
			fmt.Print("Email: ")
			e, err := reader.ReadString('\n')
			if err != nil {
				return err
			}
			email = strings.TrimSpace(e)
			if email == "" {
				fmt.Println("Email required")
				continue
			}
			re := `^[^@\s]+@[^@\s]+\.[^@\s]+$`
			if matched, _ := regexp.MatchString(re, email); !matched {
				fmt.Println("Invalid email format")
				continue
			}
			break
		}
	} else {
		re := `^[^@\s]+@[^@\s]+\.[^@\s]+$`
		if matched, _ := regexp.MatchString(re, email); !matched {
			print.Fail("email", "invalid format")
			return fmt.Errorf("invalid email format: %s", email)
		}
	}

	// Password
	password := createUserPassword
	if password == "" {
		fmt.Print("Password (min 8 chars): ")
		pw, err := reader.ReadString('\n')
		if err != nil {
			return err
		}
		password = strings.TrimSpace(pw)
	}
	if len(password) < 8 {
		print.Fail("password", "must be at least 8 characters")
		return fmt.Errorf("password must be at least 8 characters")
	}

	// Hash password
	hash, err := auth.HashPassword(password)
	if err != nil {
		print.Fail("password", fmt.Sprintf("hash: %v", err))
		return err
	}

	// Role selection (use flag value if provided, otherwise prompt)
	roleChoice := createUserRole
	if roleChoice == 0 {
		fmt.Println("Available roles:")
		for _, opt := range roleOptions {
			fmt.Printf("%d) %s\n", opt.Number, opt.Label)
		}
		fmt.Print("Select role number: ")
		roleChoiceStr, err := reader.ReadString('\n')
		if err != nil {
			return err
		}
		roleChoice, err = strconv.Atoi(strings.TrimSpace(roleChoiceStr))
		if err != nil {
			print.Fail("role", "invalid selection")
			return fmt.Errorf("invalid role selection")
		}
	}

	roleName, err := resolveRoleName(roleChoice)
	if err != nil {
		print.Fail("role", err.Error())
		return err
	}

	selectedRole, err := roleRepo.GetRoleByName(roleName)
	if err != nil {
		print.Fail("role", fmt.Sprintf("fetch %s: %v", roleName, err))
		return fmt.Errorf("fetch role %s: %w", roleName, err)
	}

	newUser := models.User{
		Username:     username,
		Email:        email,
		PasswordHash: hash,
		RoleID:       selectedRole.ID,
	}

	if err := repo.CreateUser(newUser); err != nil {
		print.Fail("user", fmt.Sprintf("create: %v", err))
		return fmt.Errorf("create user: %w", err)
	}

	// Read back the new user row to surface the assigned id + role
	// bindings on the final OK line. We post-pad so the same "optimistic"
	// output carries enough detail to debug a typo without re-running
	// the command against the DB.
	saved, err := repo.GetByUsername(username)
	id := int64(0)
	if err == nil && saved != nil {
		id = saved.ID
	}
	print.Step("username", newUser.Username)
	print.Step("email", newUser.Email)
	print.Step("role", roleName)
	print.OK("user created", fmt.Sprintf("id %d", id))
	return nil
}

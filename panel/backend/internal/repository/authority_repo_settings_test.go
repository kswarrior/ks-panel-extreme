package repository

import (
	"database/sql"
	"encoding/json"
	"strings"
	"testing"

	_ "modernc.org/sqlite"

	"github.com/example/kspanel/internal/models"
)

// newTestAuthorityDB opens a fresh in-memory SQLite with just the settings
// table the AuthorityRepository persists into.
func newTestAuthorityDB(t *testing.T) *AuthorityRepository {
	t.Helper()
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err := db.Exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`); err != nil {
		t.Fatalf("create settings: %v", err)
	}
	return NewAuthorityRepository(db)
}

func providerIn(t *testing.T, cfg *models.AuthorityConfig, id string) models.AuthorityProvider {
	t.Helper()
	p := cfg.ProviderByID(id)
	if p == nil {
		t.Fatalf("provider %s missing from config", id)
	}
	return *p
}

func TestUpdateRejectsNewlyEnabledWithoutCredentials(t *testing.T) {
	repo := newTestAuthorityDB(t)

	cfg := models.DefaultAuthorityConfig()
	google := cfg.ProviderByID(models.AuthorityProviderGoogle)
	google.Enabled = true // but no client_id / client_secret
	err := repo.Update(cfg)
	if err == nil {
		t.Fatal("enabling google without credentials must be rejected")
	}
	if !strings.Contains(err.Error(), "missing") || !strings.Contains(err.Error(), "Google") {
		t.Fatalf("error should name provider + missing fields, got: %v", err)
	}

	// Nothing may have been persisted by the rejected save.
	stored, gerr := repo.GetRaw()
	if gerr != nil {
		t.Fatal(gerr)
	}
	if providerIn(t, stored, models.AuthorityProviderGoogle).Enabled {
		t.Fatal("rejected save must not persist the enabled flag")
	}
}

func TestUpdateAcceptsFullyConfiguredProviderAndMasksOnRead(t *testing.T) {
	repo := newTestAuthorityDB(t)

	cfg := models.DefaultAuthorityConfig()
	g := cfg.ProviderByID(models.AuthorityProviderGoogle)
	g.Enabled = true
	g.ClientID = "g-client-id"
	g.ClientSecret = "g-secret-value"
	if err := repo.Update(cfg); err != nil {
		t.Fatalf("valid enable rejected: %v", err)
	}

	// Public read: secret masked, configured badge computed server-side.
	pub, err := repo.Get()
	if err != nil {
		t.Fatal(err)
	}
	gp := providerIn(t, pub, models.AuthorityProviderGoogle)
	if gp.ClientSecret != "" {
		t.Fatalf("secret must never be echoed back, got %q", gp.ClientSecret)
	}
	if !gp.Configured {
		t.Fatal("configured badge must be true while the stored secret exists")
	}
	if !gp.Enabled || gp.ClientID != "g-client-id" {
		t.Fatalf("public fields lost: %+v", gp)
	}

	// Raw read (login path): sees the real secret.
	raw, err := repo.GetRaw()
	if err != nil {
		t.Fatal(err)
	}
	if providerIn(t, raw, models.AuthorityProviderGoogle).ClientSecret != "g-secret-value" {
		t.Fatal("raw read lost the stored secret")
	}
}

func TestKeepBlankSecretRoundTrip(t *testing.T) {
	repo := newTestAuthorityDB(t)

	cfg := models.DefaultAuthorityConfig()
	a := cfg.ProviderByID(models.AuthorityProviderApple)
	a.Enabled = true
	a.ClientID = "com.example.signin"
	a.TeamID = "TEAM1234AB"
	a.KeyID = "KEY1234AB"
	a.PrivateKey = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n"
	if err := repo.Update(cfg); err != nil {
		t.Fatalf("apple enable rejected: %v", err)
	}

	// Simulate a masked UI round-trip: secret + key come back blank and are
	// sent back blank. Both must survive on the server.
	next := models.DefaultAuthorityConfig()
	na := next.ProviderByID(models.AuthorityProviderApple)
	na.Enabled = true
	na.ClientID = "com.example.signin"
	na.TeamID = "TEAM1234AB"
	na.KeyID = "KEY1234AB"
	// PrivateKey left "" — keep-blank contract.
	if err := repo.Update(next); err != nil {
		t.Fatalf("keep-blank update rejected: %v", err)
	}
	raw, _ := repo.GetRaw()
	still := providerIn(t, raw, models.AuthorityProviderApple)
	if !strings.Contains(still.PrivateKey, "BEGIN PRIVATE KEY") {
		t.Fatalf("private key wiped by blank round-trip: %q", still.PrivateKey)
	}

	// The "*" keep-marker behaves identically.
	next2 := models.DefaultAuthorityConfig()
	na2 := next2.ProviderByID(models.AuthorityProviderApple)
	*na2 = still
	na2.PrivateKey = "*"
	na2.Enabled = true
	if err := repo.Update(next2); err != nil {
		t.Fatalf("* marker update rejected: %v", err)
	}
	raw2, _ := repo.GetRaw()
	if !strings.Contains(providerIn(t, raw2, models.AuthorityProviderApple).PrivateKey, "BEGIN PRIVATE KEY") {
		t.Fatal("* marker wiped the private key")
	}
}

func TestLegacyAlreadyEnabledUnconfiguredProviderKeepsWorking(t *testing.T) {
	repo := newTestAuthorityDB(t)

	// Seed a TRUE legacy blob (as an install upgraded from pre-validation
	// code would have): discord enabled WITHOUT credentials, written
	// straight into settings bypassing Update's new enforcement.
	legacy := models.DefaultAuthorityConfig()
	legacy.ProviderByID(models.AuthorityProviderDiscord).Enabled = true
	blob, err := jsonMarshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := repo.db.Exec(
		`INSERT INTO settings (key, value) VALUES (?, ?)`,
		AuthorityConfigKey, string(blob),
	); err != nil {
		t.Fatal(err)
	}

	// An unrelated save must NOT be bricked by the stale provider.
	patch := models.DefaultAuthorityConfig()
	patch.SMTPHost = "smtp.example.com"
	patch.ProviderByID(models.AuthorityProviderDiscord).Enabled = true
	if err := repo.Update(patch); err != nil {
		t.Fatalf("unrelated save bricked by legacy unconfigured provider: %v", err)
	}
}

func TestDisableThenReenableRequiresCredentialsAgain(t *testing.T) {
	repo := newTestAuthorityDB(t)

	on := models.DefaultAuthorityConfig()
	gp := on.ProviderByID(models.AuthorityProviderGithub)
	gp.Enabled = true
	gp.ClientID = "gh-id"
	gp.ClientSecret = "gh-secret"
	if err := repo.Update(on); err != nil {
		t.Fatal(err)
	}

	off := models.DefaultAuthorityConfig() // github disabled
	if err := repo.Update(off); err != nil {
		t.Fatalf("disable rejected: %v", err)
	}

	reon := models.DefaultAuthorityConfig()
	rg := providerIn(t, reon, models.AuthorityProviderGithub)
	rg.Enabled = true
	rg.ClientID = "gh-id" // secret omitted — the previously stored secret persists
	if err := repo.Update(reon); err != nil {
		t.Fatalf("re-enable with kept stored secret should succeed: %v", err)
	}
	raw, _ := repo.GetRaw()
	if got := providerIn(t, raw, models.AuthorityProviderGithub).ClientSecret; got != "gh-secret" {
		t.Fatalf("stored secret lost across disable/re-enable: %q", got)
	}
}

// jsonMarshal mirrors what Update persists (same struct → same JSON).
func jsonMarshal(v any) ([]byte, error) {
	return json.Marshal(v)
}

func TestAllFiveProvidersValidateIndependently(t *testing.T) {
	oauthIDs := []string{
		models.AuthorityProviderGoogle,
		models.AuthorityProviderMicrosoft,
		models.AuthorityProviderApple,
		models.AuthorityProviderDiscord,
		models.AuthorityProviderGithub,
	}
	for _, id := range oauthIDs {
		t.Run(id, func(t *testing.T) {
			repo := newTestAuthorityDB(t)
			cfg := models.DefaultAuthorityConfig()
			full := map[string]func(p *models.AuthorityProvider){
				models.AuthorityProviderGoogle:    func(p *models.AuthorityProvider) { p.ClientID = "ci"; p.ClientSecret = "cs" },
				models.AuthorityProviderMicrosoft: func(p *models.AuthorityProvider) { p.ClientID = "ci"; p.ClientSecret = "cs" },
				models.AuthorityProviderDiscord:   func(p *models.AuthorityProvider) { p.ClientID = "ci"; p.ClientSecret = "cs" },
				models.AuthorityProviderGithub:    func(p *models.AuthorityProvider) { p.ClientID = "ci"; p.ClientSecret = "cs" },
				models.AuthorityProviderApple: func(p *models.AuthorityProvider) {
					p.ClientID = "svc"
					p.TeamID = "team"
					p.KeyID = "key"
					p.PrivateKey = "pem"
				},
			}[id]
			p := cfg.ProviderByID(id)
			p.Enabled = true
			full(p)
			if err := repo.Update(cfg); err != nil {
				t.Fatalf("%s fully-configured enable rejected: %v", id, err)
			}
			pub, _ := repo.Get()
			if !providerIn(t, pub, id).Configured {
				t.Fatalf("%s should read back as configured", id)
			}
		})
	}
}

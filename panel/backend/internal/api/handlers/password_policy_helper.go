package handlers

import (
	"github.com/example/kspanel/internal/auth"
	"github.com/example/kspanel/internal/repository"
)

// resolvePasswordPolicy returns the password policy configured on the
// Authority page when the password provider is enabled, otherwise the
// backend default. Errors are swallowed and fall back to the default so a
// transient DB issue can't lock everyone out.
func resolvePasswordPolicy() *auth.PasswordPolicy {
	defaultPolicy := auth.DefaultPasswordPolicy()
	con, err := repository.OpenDB()
	if err != nil {
		return defaultPolicy
	}
	defer con.Close()
	repo := repository.NewAuthorityRepository(con)
	cfg, err := repo.Get()
	if err != nil || cfg == nil || cfg.PasswordPolicy == nil {
		return defaultPolicy
	}
	return cfg.PasswordPolicy.ToAuthPasswordPolicy()
}

// resolvePasswordHistoryConfig returns the password-history configuration
// (Authentication tab → Password History). Falls back to the backend
// defaults on any read error or unconfigured section.
func resolvePasswordHistoryConfig() *auth.PasswordHistoryConfig {
	def := auth.DefaultPasswordHistoryConfig()
	con, err := repository.OpenDB()
	if err != nil {
		return def
	}
	defer con.Close()
	cfg, err := repository.NewAuthorityRepository(con).Get()
	if err != nil || cfg == nil || cfg.PasswordHistory == nil {
		return def
	}
	maxHistory := cfg.PasswordHistory.MaxHistory
	if maxHistory < 1 {
		maxHistory = def.MaxHistory
	}
	return &auth.PasswordHistoryConfig{
		Enabled:         cfg.PasswordHistory.Enabled,
		MaxHistory:      maxHistory,
		CheckSimilarity: def.CheckSimilarity,
		ReuseAllowed:    def.ReuseAllowed,
		ReuseAfter:      def.ReuseAfter,
	}
}

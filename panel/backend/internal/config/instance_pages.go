package config

import "time"

// InstancePageModuleConfig defines the runtime configuration for instance
// page modules (.kspm bundles). It is loaded from the panel config file and
// controls module storage, marketplace settings, and sandbox / security
// policies.
//
// Design reference: instance-pages.md (Configuration Files section)
type InstancePageModuleConfig struct {
	// Module storage
	ModulesDir string `json:"modules_dir"` // default: "instance_pages/modules"

	// Marketplace
	MarketplaceURL      string        `json:"marketplace_url"`      // default: "https://marketplace.kspanel.io"
	MarketplaceCacheTTL time.Duration `json:"marketplace_cache_ttl"` // default: 1h

	// Security
	MaxModuleSize     int64    `json:"max_module_size"` // default: 50MB
	AllowedOrigins    []string `json:"allowed_origins"` // for iframe sandbox
	RequireSignature  bool     `json:"require_signature"` // default: false

	// Runtime
	EnableIframeSandbox bool          `json:"enable_iframe_sandbox"` // default: true
	ModuleTimeout       time.Duration `json:"module_timeout"` // default: 30s
}

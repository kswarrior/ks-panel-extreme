package models

const (
	AuthorityProviderGoogle    = "google"
	AuthorityProviderMicrosoft = "microsoft"
	AuthorityProviderApple     = "apple"
	AuthorityProviderDiscord   = "discord"
	AuthorityProviderGithub    = "github"
	AuthorityProviderEmail     = "email"
	AuthorityProviderPhone     = "phone"
	AuthorityProviderTOTP      = "totp"
	AuthorityProviderPassword  = "password"
)

type AuthorityRegistrationMode string

const (
	AuthorityRegistrationAny AuthorityRegistrationMode = "any"
	AuthorityRegistrationN   AuthorityRegistrationMode = "n"
	AuthorityRegistrationAll AuthorityRegistrationMode = "all"
)

const AuthorityDefaultRegistrationMode = AuthorityRegistrationAny

type AuthorityProvider struct {
	ID           string `json:"id"`
	Enabled      bool   `json:"enabled"`
	ClientID     string `json:"client_id,omitempty"`
	ClientSecret string `json:"client_secret,omitempty"`
	Scopes       string `json:"scopes,omitempty"`
	RedirectURI  string `json:"redirect_uri,omitempty"`
}

type AuthorityOTPOptions struct {
	EmailEnabled    bool   `json:"email_enabled"`
	PhoneEnabled    bool   `json:"phone_enabled"`
	MagicLinkEmail  bool   `json:"magic_link_email"`
	CodeLength      int    `json:"code_length"`
	TTLSeconds      int    `json:"ttl_seconds"`
	SMSGateway      string `json:"sms_gateway,omitempty"`
	SMSAccountSID   string `json:"sms_account_sid,omitempty"`
	SMSAPIToken     string `json:"sms_api_token,omitempty"`
	SMSFromNumber   string `json:"sms_from_number,omitempty"`
}

type AuthorityAppConnection struct {
	Enabled         bool   `json:"enabled"`
	Secret          string `json:"secret,omitempty"`
	Issuer          string `json:"issuer,omitempty"`
	PinSize         int    `json:"pin_size"`
	RotationSeconds int    `json:"rotation_seconds"`
	DigitsInWindow  int    `json:"digits_in_window"`
}

type AuthorityConfig struct {
	SMTPHost     string `json:"smtp_host"`
	SMTPPort     string `json:"smtp_port"`
	SMTPUser     string `json:"smtp_user"`
	SMTPPassword string `json:"smtp_password,omitempty"`
	SMTPFrom     string `json:"smtp_from"`

	RegisterAllow      string `json:"register_allow"`
	RegisterRole       string `json:"register_role"`
	DeviceAccountLimit string `json:"device_account_limit"`
	VerifyRequired     string `json:"verify_required"`

	Providers []AuthorityProvider `json:"providers"`

	RegistrationMode             AuthorityRegistrationMode `json:"registration_mode"`
	RegistrationMinimumN         int                        `json:"registration_minimum_n"`
	RegistrationAllowedProviders []string                   `json:"registration_allowed_providers"`

	OTP      AuthorityOTPOptions     `json:"otp"`
	AppConnect AuthorityAppConnection `json:"app_connect"`
}

func DefaultAuthorityProviders() []AuthorityProvider {
	return []AuthorityProvider{
		{ID: AuthorityProviderGoogle, Enabled: false},
		{ID: AuthorityProviderMicrosoft, Enabled: false},
		{ID: AuthorityProviderApple, Enabled: false},
		{ID: AuthorityProviderDiscord, Enabled: false},
		{ID: AuthorityProviderGithub, Enabled: false},
		{ID: AuthorityProviderEmail, Enabled: false},
		{ID: AuthorityProviderPhone, Enabled: false},
		{ID: AuthorityProviderTOTP, Enabled: false},
		{ID: AuthorityProviderPassword, Enabled: true},
	}
}

func DefaultAuthorityConfig() *AuthorityConfig {
	return &AuthorityConfig{
		SMTPHost: "", SMTPPort: "", SMTPUser: "", SMTPPassword: "", SMTPFrom: "",
		RegisterAllow:      "0",
		VerifyRequired:     "0",
		RegisterRole:       "user",
		DeviceAccountLimit: "0",
		Providers:          DefaultAuthorityProviders(),
		RegistrationMode:   AuthorityDefaultRegistrationMode,
		RegistrationMinimumN: 1,
		RegistrationAllowedProviders: nil,
		OTP: AuthorityOTPOptions{
			EmailEnabled:   false,
			PhoneEnabled:   false,
			MagicLinkEmail: false,
			CodeLength:     6,
			TTLSeconds:     300,
		},
		AppConnect: AuthorityAppConnection{
			Enabled:         false,
			PinSize:         6,
			RotationSeconds: 30,
			DigitsInWindow:  1,
			Issuer:          "KS Panel",
		},
	}
}

func (c *AuthorityConfig) ProviderByID(id string) *AuthorityProvider {
	for i := range c.Providers {
		if c.Providers[i].ID == id {
			return &c.Providers[i]
		}
	}
	return nil
}

func (c *AuthorityConfig) EnabledProviders() []AuthorityProvider {
	out := make([]AuthorityProvider, 0, len(c.Providers))
	for _, p := range c.Providers {
		if p.Enabled {
			out = append(out, p)
		}
	}
	return out
}

func (c *AuthorityConfig) EnabledProviderIDs() []string {
	enabled := c.EnabledProviders()
	out := make([]string, 0, len(enabled))
	for _, p := range enabled {
		out = append(out, p.ID)
	}
	return out
}

type UserAuthorityMode string

const (
	UserAuthorityAny UserAuthorityMode = "any"
	UserAuthorityN   UserAuthorityMode = "n"
	UserAuthorityAll UserAuthorityMode = "all"
)

type UserAuthorityConfig struct {
	EnabledAuthorities []string       `json:"enabled_authorities"`
	RequiredMode       UserAuthorityMode `json:"required_mode"`
	RequiredN          int            `json:"required_n"`
}

func DefaultUserAuthorityConfig() *UserAuthorityConfig {
	return &UserAuthorityConfig{
		EnabledAuthorities: []string{"password"},
		RequiredMode:       UserAuthorityAny,
		RequiredN:          1,
	}
}
// Package oauth implements the server-side half of the "Sign in with …"
// flows for the five OAuth providers the Authority page can enable:
// Google, Microsoft, Apple, Discord and GitHub.
//
// The package owns three things so every caller (the authority repository's
// save-time validation and the HTTP handlers) share ONE source of truth:
//
//  1. the per-provider endpoint table + default scopes,
//  2. the per-provider REQUIRED-configuration check (MissingRequired) —
//     used to reject enabling a provider without credentials, to decide
//     which providers show on the public login page, and to compute the
//     Authority UI's "configured" badge,
//  3. the authorization-code flow itself: AuthCodeURL → ExchangeCode.
//
// Apple is special-cased twice: its authorization response uses
// response_mode=form_post (the callback arrives as a POST), and its token
// endpoint demands a client_secret that is a fresh ES256 JWT signed with
// the operator's .p8 private key, minted per exchange (appleJWTClientSecret).
// No external JWT dependency — stdlib crypto only.
package oauth

import (
	"context"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
)

// Profile is the normalized identity a provider hands back after the code
// exchange. Email is already lower-cased + trimmed; Verified mirrors what
// the provider claims about that address (Google / Microsoft / Apple verify
// addresses; Discord exposes a flag; GitHub reports it on the primary email).
type Profile struct {
	Email       string
	Verified    bool
	DisplayName string
}

// endpoints bundles the fixed URLs one provider flow needs. Microsoft URLs
// carry a %s verb for the tenant path segment.
type endpoints struct {
	authURL       string // may carry one %s (tenant)
	tokenURL      string // may carry one %s (tenant)
	profileURL    string // GET with Bearer access token; "" = id_token-only (Apple)
	defaultScopes string
}

var providerEndpoints = map[string]endpoints{
	models.AuthorityProviderGoogle: {
		authURL:       "https://accounts.google.com/o/oauth2/v2/auth",
		tokenURL:      "https://oauth2.googleapis.com/token",
		profileURL:    "https://openidconnect.googleapis.com/v1/userinfo",
		defaultScopes: "openid email profile",
	},
	models.AuthorityProviderMicrosoft: {
		authURL:       "https://login.microsoftonline.com/%s/oauth2/v2.0/authorize",
		tokenURL:      "https://login.microsoftonline.com/%s/oauth2/v2.0/token",
		profileURL:    "https://graph.microsoft.com/oidc/userinfo",
		defaultScopes: "openid email profile",
	},
	models.AuthorityProviderApple: {
		authURL:       "https://appleid.apple.com/auth/authorize",
		tokenURL:      "https://appleid.apple.com/auth/token",
		profileURL:    "", // identity arrives inside the id_token claim-set
		defaultScopes: "name email",
	},
	models.AuthorityProviderDiscord: {
		authURL:       "https://discord.com/api/oauth2/authorize",
		tokenURL:      "https://discord.com/api/oauth2/token",
		profileURL:    "https://discord.com/api/users/@me",
		defaultScopes: "identify email",
	},
	models.AuthorityProviderGithub: {
		authURL:       "https://github.com/login/oauth/authorize",
		tokenURL:      "https://github.com/login/oauth/access_token",
		profileURL:    "https://api.github.com/user",
		defaultScopes: "read:user user:email",
	},
}

// Known reports whether id is one of the five implemented OAuth providers.
func Known(id string) bool {
	_, ok := providerEndpoints[id]
	return ok
}

// Label is the canonical human name for an implemented OAuth provider id.
// Empty string when unknown — callers fall back to the raw id.
func Label(id string) string {
	switch id {
	case models.AuthorityProviderGoogle:
		return "Google"
	case models.AuthorityProviderMicrosoft:
		return "Microsoft"
	case models.AuthorityProviderApple:
		return "Apple"
	case models.AuthorityProviderDiscord:
		return "Discord"
	case models.AuthorityProviderGithub:
		return "GitHub"
	default:
		return ""
	}
}

// DefaultScopes returns the scope string used when the operator left the
// per-provider Scopes field blank.
func DefaultScopes(id string) string {
	if e, ok := providerEndpoints[id]; ok {
		return e.defaultScopes
	}
	return ""
}

// MissingRequired lists the config fields still missing before provider p
// can actually drive a sign-in. Empty slice == fully configured. This is
// THE definition of "configured" shared by the repo validation, the
// login-page inventory and the Authority UI badge.
func MissingRequired(p models.AuthorityProvider) []string {
	var missing []string
	switch p.ID {
	case models.AuthorityProviderApple:
		// client_id == the Services ID. The client_secret is never stored:
		// it is minted from team/key/private key at exchange time.
		if strings.TrimSpace(p.ClientID) == "" {
			missing = append(missing, "client_id (Services ID)")
		}
		if strings.TrimSpace(p.TeamID) == "" {
			missing = append(missing, "team_id")
		}
		if strings.TrimSpace(p.KeyID) == "" {
			missing = append(missing, "key_id")
		}
		if strings.TrimSpace(p.PrivateKey) == "" {
			missing = append(missing, "private_key (.p8)")
		}
	default:
		if strings.TrimSpace(p.ClientID) == "" {
			missing = append(missing, "client_id")
		}
		if strings.TrimSpace(p.ClientSecret) == "" {
			missing = append(missing, "client_secret")
		}
	}
	return missing
}

// Configured reports whether nothing is missing for this provider.
func Configured(p models.AuthorityProvider) bool {
	return len(MissingRequired(p)) == 0
}

// microsoftTenant normalizes the stored Tenant value into the path segment
// for the Microsoft URLs. Only [A-Za-z0-9._-] survive; anything else falls
// back to "common" so a hostile/mistyped value can never inject URL paths.
func microsoftTenant(t string) string {
	t = strings.TrimSpace(t)
	var b strings.Builder
	for _, r := range t {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '.', r == '-', r == '_':
			b.WriteRune(r)
		}
	}
	if b.Len() == 0 {
		return "common"
	}
	return b.String()
}

// CallbackPath is the route pattern (fmt-verb = provider id) the panel
// mounts for OAuth callbacks; also the redirect URI template the UI shows.
const CallbackPath = "/api/auth/oauth/%s/callback"

// RedirectURIFor returns the redirect URI a flow uses: the operator's
// explicit override when set, otherwise derived from the incoming request
// so the panel works behind any host/tunnel without extra config.
func RedirectURIFor(r *http.Request, p models.AuthorityProvider) string {
	if uri := strings.TrimSpace(p.RedirectURI); uri != "" {
		return uri
	}
	scheme := "http"
	if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
		scheme = "https"
	}
	return scheme + "://" + r.Host + fmt.Sprintf(CallbackPath, p.ID)
}

// AuthCodeURL builds the provider authorize redirect target.
func AuthCodeURL(r *http.Request, p models.AuthorityProvider, state string) (string, error) {
	e, ok := providerEndpoints[p.ID]
	if !ok {
		return "", fmt.Errorf("unknown oauth provider %q", p.ID)
	}
	scopes := strings.TrimSpace(p.Scopes)
	if scopes == "" {
		scopes = e.defaultScopes
	}
	q := url.Values{}
	q.Set("client_id", strings.TrimSpace(p.ClientID))
	q.Set("redirect_uri", RedirectURIFor(r, p))
	q.Set("response_type", "code")
	q.Set("scope", scopes)
	q.Set("state", state)
	if p.ID == models.AuthorityProviderApple {
		// Apple refuses response_mode=query whenever name/email scopes are
		// requested: the code MUST come back as an OAuth2 form_post. The
		// mounted callback therefore accepts POST too.
		q.Set("response_mode", "form_post")
	}
	authURL := e.authURL
	if p.ID == models.AuthorityProviderMicrosoft {
		authURL = fmt.Sprintf(e.authURL, microsoftTenant(p.Tenant))
	}
	return authURL + "?" + q.Encode(), nil
}

// ExchangeCode swaps the authorization code for tokens and returns the
// normalized Profile. Apple's one-time client_secret JWT is minted here and
// never persisted. Access/id tokens are used transiently and never logged.
func ExchangeCode(ctx context.Context, hc *http.Client, r *http.Request, p models.AuthorityProvider, code string) (*Profile, error) {
	e, ok := providerEndpoints[p.ID]
	if !ok {
		return nil, fmt.Errorf("unknown oauth provider %q", p.ID)
	}
	clientSecret := strings.TrimSpace(p.ClientSecret)
	if p.ID == models.AuthorityProviderApple {
		secret, err := appleJWTClientSecret(p)
		if err != nil {
			return nil, err
		}
		clientSecret = secret
	}

	form := url.Values{}
	form.Set("client_id", strings.TrimSpace(p.ClientID))
	form.Set("client_secret", clientSecret)
	form.Set("code", code)
	form.Set("grant_type", "authorization_code")
	form.Set("redirect_uri", RedirectURIFor(r, p))

	tokenURL := e.tokenURL
	if p.ID == models.AuthorityProviderMicrosoft {
		tokenURL = fmt.Sprintf(e.tokenURL, microsoftTenant(p.Tenant))
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	if hc == nil {
		hc = http.DefaultClient
	}
	resp, err := hc.Do(req)
	if err != nil {
		return nil, fmt.Errorf("token exchange: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("token exchange read: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token exchange failed (%d)", resp.StatusCode)
	}
	var tok struct {
		AccessToken string `json:"access_token"`
		IDToken     string `json:"id_token"`
	}
	if err := json.Unmarshal(body, &tok); err != nil {
		return nil, fmt.Errorf("token exchange decode: %w", err)
	}
	if tok.AccessToken == "" && tok.IDToken == "" {
		return nil, errors.New("token exchange returned no token")
	}

	switch p.ID {
	case models.AuthorityProviderApple:
		return profileFromIDToken(tok.IDToken)
	case models.AuthorityProviderGithub:
		return githubProfile(hc, tok.AccessToken)
	default:
		if prof, err := userInfoProfile(hc, e.profileURL, tok.AccessToken); err == nil && prof.Email != "" {
			return prof, nil
		}
		// Fallback: some tenants only surface the address inside the
		// id_token claim-set rather than the Graph/OIDC userinfo doc.
		if tok.IDToken != "" {
			if prof, err := profileFromIDToken(tok.IDToken); err == nil && prof.Email != "" {
				return prof, nil
			}
		}
		return nil, errors.New("provider did not return an email address")
	}
}

// userInfoProfile calls the OIDC-style userinfo endpoint with the bearer
// token and maps the common claim names onto Profile.
func userInfoProfile(hc *http.Client, profileURL, accessToken string) (*Profile, error) {
	if profileURL == "" {
		return nil, errors.New("no profile endpoint")
	}
	req, err := http.NewRequest(http.MethodGet, profileURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	resp, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("userinfo failed (%d)", resp.StatusCode)
	}
	var u struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Verified      bool   `json:"verified"` // Discord shape
		Name          string `json:"name"`
		Username      string `json:"username"`
		GlobalName    string `json:"global_name"`
	}
	if err := json.Unmarshal(body, &u); err != nil {
		return nil, err
	}
	display := firstNonEmpty(u.Name, u.GlobalName, u.Username)
	return &Profile{
		Email:       normalizeEmail(u.Email),
		Verified:    u.EmailVerified || u.Verified,
		DisplayName: display,
	}, nil
}

// githubProfile resolves the account's PRIMARY email via /user/emails —
// /user itself usually returns a null email these days.
func githubProfile(hc *http.Client, accessToken string) (*Profile, error) {
	u, err := userInfoProfile(hc, providerEndpoints[models.AuthorityProviderGithub].profileURL, accessToken)
	if err != nil {
		return nil, err
	}
	if u.Email != "" {
		return u, nil
	}
	req, err := http.NewRequest(http.MethodGet, "https://api.github.com/user/emails", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("user emails failed (%d)", resp.StatusCode)
	}
	var emails []struct {
		Email   string `json:"email"`
		Primary bool   `json:"primary"`
	}
	if err := json.Unmarshal(body, &emails); err != nil {
		return nil, err
	}
	for _, em := range emails {
		if em.Primary {
			u.Email = normalizeEmail(em.Email)
			u.Verified = true
			break
		}
	}
	if u.Email == "" {
		return nil, errors.New("github account has no primary email")
	}
	return u, nil
}

// profileFromIDToken parses the payload claim-set of a JWS received
// DIRECTLY from the provider's token endpoint over TLS. The signature is
// deliberately not re-verified here: the token never transited any
// untrusted channel, matching the common server-side practice for
// code-exchange responses. Claims relied upon: email, email_verified, name.
func profileFromIDToken(idToken string) (*Profile, error) {
	parts := strings.Split(idToken, ".")
	if len(parts) < 2 {
		return nil, errors.New("malformed id_token")
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("id_token payload: %w", err)
	}
	var claims struct {
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Name          string `json:"name"`
	}
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("id_token claims: %w", err)
	}
	if claims.Email == "" {
		return nil, errors.New("id_token carries no email claim")
	}
	// A missing verified claim fails CLOSED (see loop.md security rule):
	// Microsoft sometimes omits email_verified entirely, and we refuse to
	// guess "verified".
	return &Profile{
		Email:       normalizeEmail(claims.Email),
		Verified:    claims.EmailVerified,
		DisplayName: claims.Name,
	}, nil
}

// appleJWTClientSecret mints the short-lived ES256 client_assertion Apple's
// token endpoint demands: a JWT signed with the operator's .p8 key where
// iss=team_id, sub=Services ID (client_id), kid=key_id, aud=Apple. The
// signature follows JWA ES256: a raw 64-byte R||S concatenation.
func appleJWTClientSecret(p models.AuthorityProvider) (string, error) {
	key, err := parseP8Key([]byte(p.PrivateKey))
	if err != nil {
		return "", err
	}
	now := time.Now()
	header := base64RawJSON(map[string]string{
		"alg": "ES256",
		"kid": strings.TrimSpace(p.KeyID),
	})
	claims := base64RawJSON(map[string]any{
		"iss": strings.TrimSpace(p.TeamID),
		"iat": now.Unix(),
		"exp": now.Add(30 * time.Minute).Unix(),
		"aud": "https://appleid.apple.com",
		"sub": strings.TrimSpace(p.ClientID),
	})
	signingInput := header + "." + claims
	digest := sha256.Sum256([]byte(signingInput))
	r, s, err := ecdsa.Sign(rand.Reader, key, digest[:])
	if err != nil {
		return "", fmt.Errorf("apple client_secret sign: %w", err)
	}
	byteLen := (key.Curve.Params().BitSize + 7) / 8
	sig := make([]byte, 2*byteLen)
	r.FillBytes(sig[:byteLen])
	s.FillBytes(sig[byteLen:])
	return signingInput + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

// parseP8Key decodes an Apple .p8 (PKCS#8 PEM) into an ECDSA private key.
func parseP8Key(raw []byte) (*ecdsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(strings.TrimSpace(string(raw))))
	if block == nil || block.Type != "PRIVATE KEY" {
		return nil, errors.New("private_key (.p8) is not a valid PKCS#8 PEM block")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("private_key parse: %w", err)
	}
	key, ok := parsed.(*ecdsa.PrivateKey)
	if !ok {
		return nil, errors.New("private_key is not an ECDSA key")
	}
	return key, nil
}

// base64RawJSON marshals v and encodes it as unpadded base64url — the JWS
// segment encoding.
func base64RawJSON(v any) string {
	blob, _ := json.Marshal(v)
	return base64.RawURLEncoding.EncodeToString(blob)
}

func normalizeEmail(e string) string {
	return strings.ToLower(strings.TrimSpace(e))
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

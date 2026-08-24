package oauth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/example/kspanel/internal/models"
)

// swapEndpoints points every provider's token/profile URLs at a fake server
// for the duration of the test so the full exchange path is exercised
// without touching the real internet.
func swapEndpoints(t *testing.T, mutate func(id string, e *endpoints)) {
	t.Helper()
	orig := make(map[string]endpoints, len(providerEndpoints))
	for id, e := range providerEndpoints {
		orig[id] = e
	}
	for id := range providerEndpoints {
		e := orig[id]
		mutate(id, &e)
		providerEndpoints[id] = e
	}
	t.Cleanup(func() {
		for id, e := range orig {
			providerEndpoints[id] = e
		}
	})
}

func fakeProvider(t *testing.T, wantForm func(form map[string]string) bool, tokenBody string, profileBody string, profileStatus int) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.HasSuffix(r.URL.Path, "/token"):
			if err := r.ParseForm(); err != nil {
				t.Fatalf("fake token: parse form: %v", err)
			}
			form := map[string]string{}
			for k := range r.PostForm {
				form[k] = r.PostForm.Get(k)
			}
			if !wantForm(form) {
				t.Fatalf("fake token: unexpected form %+v", form)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(tokenBody))
		case strings.HasSuffix(r.URL.Path, "/profile"):
			if got := r.Header.Get("Authorization"); got != "Bearer test-access-token" {
				t.Fatalf("fake profile: bad auth header %q", got)
			}
			w.WriteHeader(profileStatus)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(profileBody))
		default:
			t.Fatalf("fake provider: unexpected path %s", r.URL.Path)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func baseRequest(host string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, host+"/api/auth/oauth/google/start", nil)
	return r
}

func TestAuthCodeURLPerProvider(t *testing.T) {
	cases := []struct {
		name       string
		p          models.AuthorityProvider
		wantPrefix string
		wantParams map[string]string
		notWant    []string
	}{
		{
			name:       "google defaults",
			p:          models.AuthorityProvider{ID: models.AuthorityProviderGoogle, ClientID: "g-id"},
			wantPrefix: "https://accounts.google.com/o/oauth2/v2/auth?",
			wantParams: map[string]string{
				"client_id": "g-id", "response_type": "code",
				"scope": "openid email profile", "state": "abc",
				"redirect_uri": "http://example.com/api/auth/oauth/google/callback",
			},
		},
		{
			name: "microsoft tenant sanitization blocks path/query injection",
			p:    models.AuthorityProvider{ID: models.AuthorityProviderMicrosoft, ClientID: "ms-id", Tenant: "evil.com/x?q=1#frag"},
			// '/' '?' '#' stripped -> one flat segment, no traversal/injection
			wantPrefix: "https://login.microsoftonline.com/evil.comxq1frag/oauth2/v2.0/authorize?",
			wantParams: map[string]string{"client_id": "ms-id"},
		},
		{
			name:       "apple forces form_post",
			p:          models.AuthorityProvider{ID: models.AuthorityProviderApple, ClientID: "com.x.signin"},
			wantPrefix: "https://appleid.apple.com/auth/authorize?",
			wantParams: map[string]string{
				"response_mode": "form_post",
				"scope":         "name email",
				"client_id":     "com.x.signin",
			},
		},
		{
			name:       "discord defaults",
			p:          models.AuthorityProvider{ID: models.AuthorityProviderDiscord, ClientID: "d-id"},
			wantPrefix: "https://discord.com/api/oauth2/authorize?",
			wantParams: map[string]string{"scope": "identify email"},
		},
		{
			name:       "github custom scopes override",
			p:          models.AuthorityProvider{ID: models.AuthorityProviderGithub, ClientID: "gh-id", Scopes: "user:email"},
			wantPrefix: "https://github.com/login/oauth/authorize?",
			wantParams: map[string]string{"scope": "user:email", "client_id": "gh-id"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := AuthCodeURL(baseRequest("http://example.com"), tc.p, "abc")
			if err != nil {
				t.Fatalf("AuthCodeURL: %v", err)
			}
			if !strings.HasPrefix(got, tc.wantPrefix) {
				t.Fatalf("prefix mismatch:\n got %s\nwant %s...", got, tc.wantPrefix)
			}
			q := parseQuery(t, got)
			for k, want := range tc.wantParams {
				if q[k] != want {
					t.Errorf("param %s = %q, want %q", k, q[k], want)
				}
			}
			if strings.Contains(got, "%28") {
				t.Errorf("double-encoded query: %s", got)
			}
		})
	}
}

func TestRedirectURIFor(t *testing.T) {
	p := models.AuthorityProvider{ID: models.AuthorityProviderGoogle, RedirectURI: "https://override.example/cb"}
	r := baseRequest("http://panel.local")
	if got := RedirectURIFor(r, p); got != "https://override.example/cb" {
		t.Fatalf("override not respected: %q", got)
	}
	p.RedirectURI = ""
	if got := RedirectURIFor(r, p); got != "http://panel.local/api/auth/oauth/google/callback" {
		t.Fatalf("derived redirect wrong: %q", got)
	}
	r2 := httptest.NewRequest(http.MethodGet, "http://panel.local/x", nil)
	r2.Header.Set("X-Forwarded-Proto", "https")
	if got := RedirectURIFor(r2, p); !strings.HasPrefix(got, "https://") {
		t.Fatalf("forwarded proto ignored: %q", got)
	}
}

func TestMissingRequired(t *testing.T) {
	google := models.AuthorityProvider{ID: models.AuthorityProviderGoogle}
	if missing := MissingRequired(google); len(missing) != 2 {
		t.Fatalf("google missing = %v", missing)
	}
	google.ClientID, google.ClientSecret = "a", "b"
	if MissingRequired(google) != nil {
		t.Fatalf("google should be configured")
	}
	apple := models.AuthorityProvider{ID: models.AuthorityProviderApple, ClientID: "svc", ClientSecret: "ignored"}
	missing := MissingRequired(apple)
	if len(missing) != 3 { // team_id, key_id, private_key — secret NOT required for apple
		t.Fatalf("apple missing = %v", missing)
	}
	apple.TeamID, apple.KeyID = "T", "K"
	apple.PrivateKey = "not-a-pem"
	if MissingRequired(apple) != nil {
		t.Fatalf("apple should be configured with all four fields")
	}
}

func TestExchangeCodeUserInfoProviders(t *testing.T) {
	providers := []struct {
		id           string
		clientID     string
		profileJSON  string
		wantEmail    string
		wantVerified bool
		wantDisplay  string
	}{
		{
			id: models.AuthorityProviderGoogle, clientID: "g-id",
			profileJSON: `{"sub":"1","email":"User@Example.com","email_verified":true,"name":"Ann Example"}`,
			wantEmail:   "user@example.com", wantVerified: true, wantDisplay: "Ann Example",
		},
		{
			id: models.AuthorityProviderDiscord, clientID: "d-id",
			profileJSON: `{"id":"9","username":"disc","global_name":"Disc Guy","email":"d@example.com","verified":true}`,
			wantEmail:   "d@example.com", wantVerified: true, wantDisplay: "Disc Guy",
		},
		{
			id: models.AuthorityProviderMicrosoft, clientID: "ms-id",
			profileJSON: `{"sub":"7","email":"m@example.com","email_verified":true}`,
			wantEmail:   "m@example.com", wantVerified: true,
		},
	}
	for _, tc := range providers {
		t.Run(tc.id, func(t *testing.T) {
			var sawSecret string
			srv := fakeProvider(t,
				func(form map[string]string) bool {
					sawSecret = form["client_secret"]
					return form["client_id"] == tc.clientID &&
						form["code"] == "the-code" &&
						form["grant_type"] == "authorization_code" &&
						form["redirect_uri"] != "" &&
						strings.Contains(form["redirect_uri"], "/api/auth/oauth/"+tc.id+"/callback")
				},
				`{"access_token":"test-access-token"}`,
				tc.profileJSON, http.StatusOK,
			)
			swapEndpoints(t, func(id string, e *endpoints) {
				// Microsoft's URLs keep their %s tenant verb, matching the
				// production table exactly.
				if id == models.AuthorityProviderMicrosoft {
					e.tokenURL = srv.URL + "/%s/token"
				} else {
					e.tokenURL = srv.URL + "/token"
				}
				e.profileURL = srv.URL + "/profile"
			})
			p := models.AuthorityProvider{ID: tc.id, ClientID: tc.clientID, ClientSecret: "stored-secret"}
			req := baseRequest("http://example.com")
			prof, err := ExchangeCode(context.Background(), srv.Client(), req, p, "the-code")
			if err != nil {
				t.Fatalf("ExchangeCode(%s): %v", tc.id, err)
			}
			if prof.Email != tc.wantEmail || prof.Verified != tc.wantVerified || prof.DisplayName != tc.wantDisplay {
				t.Fatalf("profile mismatch: %+v", prof)
			}
			if sawSecret != "stored-secret" {
				t.Fatalf("client_secret not sent: %q", sawSecret)
			}
		})
	}
}

func TestExchangeCodeMicrosoftIDTokenFallback(t *testing.T) {
	idToken := fakeIDToken(t, `{"email":"FALLBACK@Example.com","name":"Ms User"}`) // no email_verified on purpose
	srv := fakeProvider(t, func(map[string]string) bool { return true },
		`{"access_token":"test-access-token","id_token":"`+idToken+`"}`,
		`{"sub":"7"}`, http.StatusOK, // Graph doc without email
	)
	swapEndpoints(t, func(id string, e *endpoints) {
		e.tokenURL = srv.URL + "/%s/token" // microsoft keeps the tenant verb
		e.profileURL = srv.URL + "/profile"
	})
	p := models.AuthorityProvider{ID: models.AuthorityProviderMicrosoft, ClientID: "ms-id", ClientSecret: "s"}
	prof, err := ExchangeCode(context.Background(), srv.Client(), baseRequest("http://x"), p, "c")
	if err != nil {
		t.Fatalf("fallback exchange: %v", err)
	}
	if prof.Email != "fallback@example.com" {
		t.Fatalf("fallback email = %q", prof.Email)
	}
	if prof.Verified {
		t.Fatal("missing email_verified must fail CLOSED (verified=false)")
	}
}

func TestExchangeCodeGitHubPrimaryEmail(t *testing.T) {
	srv := fakeProvider(t, func(map[string]string) bool { return true },
		`{"access_token":"test-access-token"}`,
		`{"login":"octocat","email":null,"name":"Octo Cat"}`, http.StatusOK,
	)
	emailsSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Accept") != "application/vnd.github+json" {
			t.Errorf("github emails Accept header = %q", r.Header.Get("Accept"))
		}
		_, _ = w.Write([]byte(`[{"email":"alias@example.com","primary":false},{"email":"Prime@Example.com","primary":true}]`))
	}))
	defer emailsSrv.Close()

	oldEmails := githubEmailsURL
	githubEmailsURL = emailsSrv.URL
	defer func() { githubEmailsURL = oldEmails }()

	swapEndpoints(t, func(id string, e *endpoints) {
		e.tokenURL = srv.URL + "/token"
		e.profileURL = srv.URL + "/profile"
	})
	p := models.AuthorityProvider{ID: models.AuthorityProviderGithub, ClientID: "gh-id", ClientSecret: "s"}
	prof, err := ExchangeCode(context.Background(), srv.Client(), baseRequest("http://x"), p, "c")
	if err != nil {
		t.Fatalf("github exchange: %v", err)
	}
	if prof.Email != "prime@example.com" || !prof.Verified || prof.DisplayName != "Octo Cat" {
		t.Fatalf("github profile mismatch: %+v", prof)
	}
}

func TestExchangeCodeAppleEndToEnd(t *testing.T) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	p8 := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))

	var gotClientSecret string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		gotClientSecret = r.PostForm.Get("client_secret")
		if r.PostForm.Get("grant_type") != "authorization_code" ||
			r.PostForm.Get("code") != "apple-code" ||
			r.PostForm.Get("client_id") != "com.example.panel.signin" {
			t.Fatalf("apple token form mismatch: %+v", r.PostForm)
		}
		idToken := fakeIDToken(t, `{"email":"Apple@Example.com","email_verified":true,"name":"Apple Person"}`)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"at","id_token":"` + idToken + `"}`))
	}))
	defer srv.Close()

	swapEndpoints(t, func(id string, e *endpoints) {
		e.tokenURL = srv.URL + "/token"
	})

	p := models.AuthorityProvider{
		ID: models.AuthorityProviderApple, ClientID: "com.example.panel.signin",
		TeamID: "TEAMID1234", KeyID: "KEYID1234", PrivateKey: p8,
	}
	prof, err := ExchangeCode(context.Background(), srv.Client(), baseRequest("http://x"), p, "apple-code")
	if err != nil {
		t.Fatalf("apple exchange: %v", err)
	}
	if prof.Email != "apple@example.com" || !prof.Verified || prof.DisplayName != "Apple Person" {
		t.Fatalf("apple profile mismatch: %+v", prof)
	}

	// Verify the minted client_secret is a proper ES256 JWS: header kid/alg,
	// claims iss=team, sub=services id, aud=apple, and a raw R||S signature
	// that validates with the .p8 public key.
	parts := strings.Split(gotClientSecret, ".")
	if len(parts) != 3 {
		t.Fatalf("client_secret not a JWS: %q", gotClientSecret)
	}
	hdr, claims, sig := decodeSeg(t, parts[0]), decodeSeg(t, parts[1]), mustB64(t, parts[2])
	var h struct {
		Alg string `json:"alg"`
		Kid string `json:"kid"`
	}
	_ = json.Unmarshal(hdr, &h)
	if h.Alg != "ES256" || h.Kid != "KEYID1234" {
		t.Fatalf("JWS header = %+v", h)
	}
	var c struct {
		Iss string `json:"iss"`
		Sub string `json:"sub"`
		Aud string `json:"aud"`
		Exp int64  `json:"exp"`
	}
	_ = json.Unmarshal(claims, &c)
	if c.Iss != "TEAMID1234" || c.Sub != "com.example.panel.signin" || c.Aud != "https://appleid.apple.com" {
		t.Fatalf("JWS claims = %+v", c)
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	byteLen := 32
	if len(sig) != 2*byteLen {
		t.Fatalf("ES256 sig must be raw R||S of 64 bytes, got %d", len(sig))
	}
	rVal := new(big.Int).SetBytes(sig[:byteLen])
	sVal := new(big.Int).SetBytes(sig[byteLen:])
	if !ecdsa.Verify(&key.PublicKey, digest[:], rVal, sVal) {
		t.Fatal("ES256 signature does not verify with the .p8 public key")
	}
}

func TestAppleBadP8FailsClosed(t *testing.T) {
	p := models.AuthorityProvider{
		ID: models.AuthorityProviderApple, ClientID: "svc", TeamID: "t", KeyID: "k",
		PrivateKey: "-----BEGIN PRIVATE KEY-----\nGARBAGE\n-----END PRIVATE KEY-----\n",
	}
	if _, err := ExchangeCode(context.Background(), http.DefaultClient, baseRequest("http://x"), p, "c"); err == nil {
		t.Fatal("garbage .p8 must fail closed")
	}
}

// ── helpers ────────────────────────────────────────────────────────────────

func fakeIDToken(t *testing.T, payloadJSON string) string {
	t.Helper()
	return "header." + base64.RawURLEncoding.EncodeToString([]byte(payloadJSON)) + ".sig"
}

func decodeSeg(t *testing.T, seg string) []byte {
	t.Helper()
	b, err := base64.RawURLEncoding.DecodeString(seg)
	if err != nil {
		t.Fatalf("bad jws segment: %v", err)
	}
	return b
}

func mustB64(t *testing.T, s string) []byte {
	t.Helper()
	b, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		t.Fatalf("bad b64: %v", err)
	}
	return b
}

func parseQuery(t *testing.T, raw string) map[string]string {
	t.Helper()
	q := raw[strings.Index(raw, "?")+1:]
	out := map[string]string{}
	for _, kv := range strings.Split(q, "&") {
		k, v, _ := strings.Cut(kv, "=")
		out[unescape(t, k)] = unescape(t, v)
	}
	return out
}

func unescape(t *testing.T, s string) string {
	t.Helper()
	v, err := url.QueryUnescape(s)
	if err != nil {
		t.Fatalf("unescape %q: %v", s, err)
	}
	return v
}

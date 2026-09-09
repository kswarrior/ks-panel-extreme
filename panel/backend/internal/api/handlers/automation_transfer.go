package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/cron"
	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
	"gopkg.in/yaml.v3"
)

// automation_transfer.go owns the YAML share path for automation jobs:
// download one job as a GitHub-Actions-style YAML file, upload a local
// file, or import by URL (server-side fetch, SSRF-guarded like the
// instance-page/template URL imports). The file is one job per document:
//
//	name: Nightly backup
//	schedule: "0 4 * * *"        # '' = manual only
//	enabled: true
//	timeout_sec: 300             # capped by the template ceiling on import
//	secret_refs: [S3_KEY]
//	kind: shell                  # single-shot fallback when steps is empty
//	command: tar czf /backups/world.tgz /mc/world
//	steps:
//	  - name: stop server
//	    kind: power
//	    op: stop                # alias for payload
//	    if: success              # success|failure|always (default success)
//	  - name: backup world
//	    run: tar czf /backups/world.tgz /mc/world   # alias for command
//	    if: success
//	  - name: shout on failure
//	    run: echo backup failed
//	    if: failure
//
// Step shell scripts accept `command` or `run`; power/action targets
// accept `payload`, `op` or `action`. Conditions accept the canonical
// success|failure|always plus the common aliases (failed/fail,
// succeed/succeeded, alway) — NormalizeAutomationIf folds them.

// automationYAMLStep is the on-disk step shape (aliases included).
type automationYAMLStep struct {
	Name       string `yaml:"name" json:"name"`
	Kind       string `yaml:"kind" json:"kind"`
	Command    string `yaml:"command" json:"command"`
	Run        string `yaml:"run" json:"run"`
	Payload    string `yaml:"payload" json:"payload"`
	Op         string `yaml:"op" json:"op"`
	Action     string `yaml:"action" json:"action"`
	If         string `yaml:"if" json:"if"`
	TimeoutSec int    `yaml:"timeout_sec" json:"timeout_sec"`
}

// automationYAMLDoc is the on-disk job shape.
type automationYAMLDoc struct {
	Name       string               `yaml:"name" json:"name"`
	Schedule   string               `yaml:"schedule" json:"schedule"`
	Enabled    *bool                `yaml:"enabled" json:"enabled"`
	SecretRefs []string             `yaml:"secret_refs" json:"secret_refs"`
	TimeoutSec int                  `yaml:"timeout_sec" json:"timeout_sec"`
	Kind       string               `yaml:"kind" json:"kind"`
	Command    string               `yaml:"command" json:"command"`
	Run        string               `yaml:"run" json:"run"`
	Payload    string               `yaml:"payload" json:"payload"`
	Op         string               `yaml:"op" json:"op"`
	Action     string               `yaml:"action" json:"action"`
	Steps      []automationYAMLStep `yaml:"steps" json:"steps"`
}

func (d automationYAMLDoc) command() string {
	if d.Command != "" {
		return d.Command
	}
	return d.Run
}

func (d automationYAMLDoc) payload() string {
	if d.Payload != "" {
		return d.Payload
	}
	if d.Op != "" {
		return d.Op
	}
	return d.Action
}

func (s automationYAMLStep) command() string {
	if s.Command != "" {
		return s.Command
	}
	return s.Run
}

func (s automationYAMLStep) payload() string {
	if s.Payload != "" {
		return s.Payload
	}
	if s.Op != "" {
		return s.Op
	}
	return s.Action
}

// automationDocToUpsert folds the YAML/JSON document into the same write
// shape the JSON create endpoint validates, so import and manual create
// share one policy (kind toggles, action resolution, timeout ceiling,
// cron parse, step rules).
func automationDocToUpsert(doc automationYAMLDoc) automationUpsertRequest {
	steps := make([]automationStepRequest, 0, len(doc.Steps))
	for _, s := range doc.Steps {
		steps = append(steps, automationStepRequest{
			Name:       strings.TrimSpace(s.Name),
			Kind:       s.Kind,
			Command:    s.command(),
			Payload:    s.Payload,
			If:         s.If,
			TimeoutSec: s.TimeoutSec,
		})
		// payload() alias fold (op/action) — applied after struct build so
		// the explicit payload key keeps precedence.
		if steps[len(steps)-1].Payload == "" {
			steps[len(steps)-1].Payload = s.payload()
		}
	}
	enabled := true
	if doc.Enabled != nil {
		enabled = *doc.Enabled
	}
	req := automationUpsertRequest{
		Name:       strings.TrimSpace(doc.Name),
		Command:    doc.command(),
		Kind:       doc.Kind,
		Payload:    doc.payload(),
		Schedule:   strings.TrimSpace(doc.Schedule),
		Enabled:    enabled,
		SecretRefs: doc.SecretRefs,
		TimeoutSec: doc.TimeoutSec,
		Steps:      steps,
	}
	if req.SecretRefs == nil {
		req.SecretRefs = []string{}
	}
	return req
}

// parseAutomationDoc parses a YAML (or JSON — YAML 1.2 is a superset)
// automation body with a hard size cap enforced by callers.
func parseAutomationDoc(body []byte) (automationUpsertRequest, error) {
	var doc automationYAMLDoc
	if err := yaml.Unmarshal(body, &doc); err != nil {
		return automationUpsertRequest{}, fmt.Errorf("invalid YAML: %v", err)
	}
	return automationDocToUpsert(doc), nil
}

// automationToYAMLDoc renders a stored job for download.
func automationToYAMLDoc(job *models.Automation) automationYAMLDoc {
	steps := make([]automationYAMLStep, 0, len(job.Steps))
	for _, s := range job.Steps {
		steps = append(steps, automationYAMLStep{
			Name: s.Name, Kind: s.Kind, Command: s.Command,
			Payload: s.Payload, If: s.If, TimeoutSec: s.TimeoutSec,
		})
	}
	enabled := job.Enabled
	return automationYAMLDoc{
		Name: job.Name, Schedule: job.Schedule, Enabled: &enabled,
		SecretRefs: append([]string{}, job.SecretRefs...),
		TimeoutSec: job.TimeoutSec, Kind: job.Kind,
		Command: job.Command, Payload: job.Payload, Steps: steps,
	}
}

// DownloadAutomationHandler returns one job as a downloadable YAML file.
// Secret VALUES never leave the vault — only secret_refs key names ship.
func DownloadAutomationHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	jobID, err := strconv.ParseInt(chi.URLParam(r, "job_id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid job id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	job, err := repository.NewAutomationRepository(con).Get(jobID)
	if err != nil || job.InstanceID != id {
		http.Error(w, "automation not found", http.StatusNotFound)
		return
	}
	out, err := yaml.Marshal(automationToYAMLDoc(job))
	if err != nil {
		http.Error(w, "failed to serialize automation", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/yaml")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s.yaml\"", sanitizeDownloadFilename(job.Name)))
	_, _ = w.Write(append([]byte("# KS Panel automation — import via Automation > Upload / Import from URL\n"), out...))
}

// ImportAutomationHandler accepts a local file body (YAML or JSON) and
// creates one job on the instance. Same validation as manual create.
func ImportAutomationHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	const maxImportBytes = 256 << 10
	r.Body = http.MaxBytesReader(w, r.Body, maxImportBytes+1)
	body, err := io.ReadAll(io.LimitReader(r.Body, maxImportBytes+1))
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}
	if int64(len(body)) > maxImportBytes {
		http.Error(w, fmt.Sprintf("body exceeded %d bytes", maxImportBytes), http.StatusRequestEntityTooLarge)
		return
	}
	// Multipart local-file upload (frontend File) or a raw body — both land here.
	if ct := r.Header.Get("Content-Type"); strings.HasPrefix(ct, "multipart/") {
		if err := r.ParseMultipartForm(maxImportBytes + (1 << 20)); err != nil {
			http.Error(w, "invalid multipart body", http.StatusBadRequest)
			return
		}
		var found []byte
		for _, files := range r.MultipartForm.File {
			for _, fh := range files {
				f, oerr := fh.Open()
				if oerr != nil {
					continue
				}
				b, rerr := io.ReadAll(io.LimitReader(f, maxImportBytes+1))
				_ = f.Close()
				if rerr != nil {
					continue
				}
				found = b
				break
			}
			if found != nil {
				break
			}
		}
		if found == nil {
			// Fall back to a plain "file" form value.
			if s := strings.TrimSpace(r.FormValue("file")); s != "" {
				found = []byte(s)
			}
		}
		if found == nil {
			http.Error(w, "no file uploaded", http.StatusBadRequest)
			return
		}
		body = found
		if int64(len(body)) > maxImportBytes {
			http.Error(w, fmt.Sprintf("file exceeded %d bytes", maxImportBytes), http.StatusRequestEntityTooLarge)
			return
		}
	}
	req, perr := parseAutomationDoc(body)
	if perr != nil {
		http.Error(w, perr.Error(), http.StatusBadRequest)
		return
	}
	createAutomationFromImport(w, r, id, req)
}

// ImportAutomationFromURLHandler fetches a YAML/JSON automation from the
// supplied URL and creates one job. SSRF-guarded (public IPs only,
// DNS-pinned, size/time capped) like the instance-page URL import.
func ImportAutomationFromURLHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid instance id", http.StatusBadRequest)
		return
	}
	var dto struct {
		URL string `json:"url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	rawURL := strings.TrimSpace(dto.URL)
	u, err := url.Parse(rawURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		http.Error(w, "url must be an http(s) URL with a host", http.StatusBadRequest)
		return
	}
	host := u.Hostname()
	if host == "" {
		http.Error(w, "url is missing a host", http.StatusBadRequest)
		return
	}
	resolver := net.Resolver{PreferGo: true}
	dnsCtx, cancelDNS := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancelDNS()
	ips, err := resolver.LookupIPAddr(dnsCtx, host)
	if err != nil || len(ips) == 0 {
		http.Error(w, "could not resolve host: "+host, http.StatusBadGateway)
		return
	}
	for _, ipa := range ips {
		if ip := ipa.IP; ip == nil || !isPublicIP(ip) {
			which := ""
			if ip != nil {
				which = " (" + ip.String() + ")"
			}
			http.Error(w, fmt.Sprintf("refusing to fetch %s: host resolves to a non-public address%s", host, which), http.StatusBadRequest)
			return
		}
	}
	client := instancePagePinnedClient(ips, portFromHost(u.Host, u.Scheme))
	defer client.CloseIdleConnections()
	fetchReq, rerr := http.NewRequestWithContext(r.Context(), http.MethodGet, rawURL, nil)
	if rerr != nil {
		http.Error(w, "invalid URL", http.StatusBadRequest)
		return
	}
	resp, err := client.Do(fetchReq)
	if err != nil {
		http.Error(w, "failed to fetch URL: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Sprintf("URL returned status %d", resp.StatusCode), http.StatusBadGateway)
		return
	}
	const maxImportURLBytes = 1 << 20
	urlBody, err := io.ReadAll(io.LimitReader(resp.Body, maxImportURLBytes+1))
	if err != nil {
		http.Error(w, "failed to read URL body: "+err.Error(), http.StatusBadGateway)
		return
	}
	if int64(len(urlBody)) > maxImportURLBytes {
		http.Error(w, fmt.Sprintf("remote body exceeded %d bytes", maxImportURLBytes), http.StatusRequestEntityTooLarge)
		return
	}
	req, perr := parseAutomationDoc(urlBody)
	if perr != nil {
		http.Error(w, "remote body: "+perr.Error(), http.StatusBadRequest)
		return
	}
	createAutomationFromImport(w, r, id, req)
}

// createAutomationFromImport runs the shared write path for both import
// flavors (name + cron + kind/toggle/action/timeout/step validation,
// pre-arm, audit). Validation errors surface as the same plain-text 4xx
// the manual create endpoint emits so the SPA toast reads identically.
func createAutomationFromImport(w http.ResponseWriter, r *http.Request, instanceID int64, req automationUpsertRequest) {
	if strings.TrimSpace(req.Name) == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if len(req.Name) > 100 {
		http.Error(w, "name too long (max 100)", http.StatusBadRequest)
		return
	}
	if req.Schedule != "" {
		if _, err := cron.Parse(req.Schedule); err != nil {
			http.Error(w, "invalid schedule: "+err.Error(), http.StatusBadRequest)
			return
		}
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	kind, st, msg := validateAutomationUpsert(con, instanceID, req)
	if st != 0 {
		http.Error(w, msg, st)
		return
	}
	repo := repository.NewAutomationRepository(con)
	jobID, err := repo.Create(repository.AutomationUpsertInput{
		InstanceID: instanceID, Name: strings.TrimSpace(req.Name),
		Command: req.Command, Kind: kind, Payload: req.Payload,
		Schedule: req.Schedule, Enabled: req.Enabled,
		SecretRefs: req.SecretRefs, TimeoutSec: req.TimeoutSec,
		Steps: automationStepsToModel(req.Steps),
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Schedule != "" && req.Enabled {
		_ = repo.ScheduleNext(jobID, cronNext(req.Schedule, time.Now()))
	}
	auditInst(r, instanceID, "automation.import", fmt.Sprintf("imported %s job %q (%s)", kind, strings.TrimSpace(req.Name), scheduleLabel(req.Schedule)))
	writeJSONStatus(w, http.StatusCreated, map[string]any{"id": jobID})
}

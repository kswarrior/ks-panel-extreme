package handlers

// mod_samples.go — the panel's built-in sample mods ("test mods").
//
// The catalog is code, not DB: each sample is a small manifest (+ inline
// backend script where useful) the admin can one-click install through
// POST /api/mods/samples/{key}. Installing goes through the EXACT same
// validated pipeline as a file upload (ParseManifest -> CreateMod ->
// mod_permissions seeded pending), so samples arrive INACTIVE and only run
// after the admin approves their capabilities. They exist so the grant /
// activate / hook / storage flows can be exercised end-to-end without
// hand-writing manifests.

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/modengine"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// sampleMod is one built-in test mod definition.
type sampleMod struct {
	// Key is the stable URL identifier (POST /api/mods/samples/{key}).
	Key string `json:"key"`
	// Name / Description / Icon are display fields for the picker UI.
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"` // emoji
	// EngineVersion is 1 for static manifests, 2 when BackendScriptSource set.
	EngineVersion int `json:"engine_version"`
	// Permissions is the requested-capability preview so the admin sees what
	// approval flow to expect BEFORE installing.
	Permissions []repository.PermissionReq `json:"permissions"`
	// HasScript advertises that the sample ships an inline v2 backend script.
	HasScript bool `json:"has_script"`

	// manifest is the exact JSON body the install path posts to
	// repository.ParseManifest. Not serialized in the list response.
	manifest map[string]any
}

// sampleMods is the catalog. Keep keys lowercase-alphanumeric+dash: they ride
// in a URL path segment and are looked up verbatim.
var sampleMods = []sampleMod{
	{
		Key:           "event-logger",
		Name:          "Event Logger",
		Description:   "v2 demo: subscribes to instance start/stop events, logs them via ks.log and keeps counters in the mod's private storage. Requests db.read_only so you can exercise the approval checklist.",
		Icon:          "🛰️",
		EngineVersion: 2,
		Permissions: []repository.PermissionReq{
			{Capability: models.CapDatabaseRead, AccessLevel: "read_only"},
		},
		HasScript: true,
		manifest: map[string]any{
			"name":          "Event Logger",
			"slug":          "event-logger",
			"version":       "1.0.0",
			"description":   "Built-in sample: logs instance lifecycle events and counts them in namespaced storage.",
			"engineVersion": 2,
			"backendScriptSource": `// Event Logger — built-in KS Panel sample.
// Runs inside the panel's sandboxed VM. No host OS access; only ks.log /
// ks.storage / ks.events are reachable from here.
function bump(key) {
  var n = Number(ks.storage.get(key) || 0) + 1;
  ks.storage.set(key, n);
  return n;
}

ks.events.on('post:instance.start', function (payload) {
  var id = payload && payload.id;
  ks.log('info', 'instance started (id=' + id + '), total starts: ' + bump('starts'));
});

ks.events.on('post:instance.stop', function (payload) {
  var id = payload && payload.id;
  ks.log('info', 'instance stopped (id=' + id + '), total stops: ' + bump('stops'));
});

ks.log('info', 'Event Logger loaded');`,
		},
	},
	{
		Key:           "guardian",
		Name:          "Destroy Guard",
		Description:   "v2 demo: registers a cancellable pre-hook on instance destroy that logs a veto point. Shows how pre-hooks can gate destructive host actions (this sample never cancels). Zero capabilities.",
		Icon:          "🛡️",
		EngineVersion: 2,
		Permissions:   []repository.PermissionReq{},
		HasScript:     true,
		manifest: map[string]any{
			"name":          "Destroy Guard",
			"slug":          "destroy-guard",
			"version":       "1.0.0",
			"description":   "Built-in sample: demonstrates a pre-destroy hook observing (not blocking) destructive actions.",
			"engineVersion": 2,
			"backendScriptSource": `// Destroy Guard — built-in KS Panel sample.
// A "pre:" subscription runs synchronously BEFORE the host action and may
// cancel it by returning {cancel:true, message:"..."}. This sample always
// passes through — flip the flag below to see cancellation in action.
var WOULD_CANCEL = false;

ks.events.on('pre:instance.destroy', function (payload) {
  var id = payload && payload.id;
  if (WOULD_CANCEL) {
    ks.log('warn', 'vetoing destroy of instance ' + id);
    return { cancel: true, message: 'Destroy blocked by Destroy Guard sample' };
  }
  ks.log('info', 'instance.destroy observed (id=' + id + ')');
});

ks.log('info', 'Destroy Guard loaded');`,
		},
	},
	{
		Key:           "permission-probe",
		Name:          "Permission Probe",
		Description:   "v1 demo: no code at all — just a wide capability request set. Perfect for testing the per-capability approval modal and the pending-grants activation gate.",
		Icon:          "🧪",
		EngineVersion: 1,
		Permissions: []repository.PermissionReq{
			{Capability: models.CapDatabaseRead, AccessLevel: "read_only"},
			{Capability: models.CapTerminal, AccessLevel: "read_only"},
			{Capability: models.CapContainerControl, AccessLevel: "read_only"},
			{Capability: models.CapFilesystem, AccessLevel: "read_only"},
		},
		HasScript: false,
		manifest: map[string]any{
			"name":        "Permission Probe",
			"slug":        "permission-probe",
			"version":     "1.0.0",
			"description": "Built-in sample: requests four read-only capabilities with no code — exercise the grant/activate pipeline.",
			"permissionsRequested": []map[string]string{
				{"capability": models.CapDatabaseRead, "access_level": "read_only"},
				{"capability": models.CapTerminal, "access_level": "read_only"},
				{"capability": models.CapContainerControl, "access_level": "read_only"},
				{"capability": models.CapFilesystem, "access_level": "read_only"},
			},
		},
	},
	{
		Key:           "hello-slot",
		Name:          "Hello Slot",
		Description:   "v1 demo: declares a UI injection point (instance.detail.header) with static props. Useful for verifying the slot registry endpoint renders your slot declarations.",
		Icon:          "🎨",
		EngineVersion: 1,
		Permissions:   []repository.PermissionReq{},
		HasScript:     false,
		manifest: map[string]any{
			"name":        "Hello Slot",
			"slug":        "hello-slot",
			"version":     "1.0.0",
			"description": "Built-in sample: declares a header slot with static props (no script, zero capabilities).",
			"slots": []map[string]any{
				{
					"name":      "instance.detail.header",
					"component": "Banner",
					"props":     map[string]any{"text": "Hello from the Hello Slot sample", "tone": "info"},
				},
			},
		},
	},
}

// errSampleNotFound is returned when the URL key matches nothing.
var errSampleNotFound = errors.New("sample not found")

// findSample looks a catalog entry up by key (exact match).
func findSample(key string) (*sampleMod, error) {
	for i := range sampleMods {
		if sampleMods[i].Key == key {
			return &sampleMods[i], nil
		}
	}
	return nil, errSampleNotFound
}

// buildSampleManifest serialises the sample's manifest map. The v1 permission
// block is injected uniformly so ParseManifest (which reads
// permissionsRequested) validates every sample identically regardless of
// engine version.
func buildSampleManifest(s *sampleMod) ([]byte, error) {
	m := make(map[string]any, len(s.manifest)+1)
	for k, v := range s.manifest {
		m[k] = v
	}
	if _, ok := m["permissionsRequested"]; !ok {
		pr := s.Permissions
		if pr == nil {
			pr = []repository.PermissionReq{}
		}
		m["permissionsRequested"] = pr
	}
	b, err := json.Marshal(m)
	if err != nil {
		return nil, fmt.Errorf("serialise sample manifest: %w", err)
	}
	return b, nil
}

// ListSampleModsHandler serves the built-in sample catalog (GET
// /api/mods/samples). Read-only metadata; installing is a separate POST so
// the create permission gates the write.
func ListSampleModsHandler(w http.ResponseWriter, r *http.Request) {
	out := make([]sampleMod, 0, len(sampleMods))
	for i := range sampleMods {
		out = append(out, sampleMods[i])
	}
	writeJSON(w, out)
}

// InstallSampleModHandler installs a built-in sample as a REAL mod row
// (POST /api/mods/samples/{key}). The manifest is serialised from the catalog
// and pushed through repository.ParseManifest (capability whitelist, slug
// contract, duplicate rejection) then repo.CreateMod exactly like every other
// install source. Provenance is stamped source="sample". The synthesised
// .kspm lands on disk so the sample stays downloadable like any other mod.
func InstallSampleModHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	key := chi.URLParam(r, "key")
	sample, serr := findSample(strings.TrimSpace(key))
	if serr != nil {
		http.Error(w, "unknown sample: "+key, http.StatusNotFound)
		return
	}

	rawManifest, err := buildSampleManifest(sample)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	in, err := repository.ParseManifest(rawManifest)
	if err != nil {
		// A broken built-in sample is a programming error — log loudly but
		// answer the client with a clean 500 rather than leaking internals.
		log.Printf("InstallSample: built-in sample %q failed validation: %v", key, err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}

	// Synthesise a .kspm so the installed sample behaves like any other mod
	// on the download path (and the engine workdir story stays uniform).
	specBytes := []byte("{}")
	if len(in.Spec) > 0 {
		specBytes = in.Spec
	}
	packageBytes, berr := modengine.BuildPackageZip(rawManifest, specBytes, nil)
	if berr != nil {
		http.Error(w, "build package: "+berr.Error(), http.StatusInternalServerError)
		return
	}

	repo, closeFn := openModRepo()
	if repo == nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer closeFn()

	mod, err := repo.CreateMod(repository.CreateModInput{
		Name:                 in.Name,
		Slug:                 in.Slug,
		Version:              in.Version,
		Description:          in.Description,
		Manifest:             rawManifest,
		Spec:                 in.Spec,
		PermissionsRequested: in.PermissionsRequested,
		UploadedBy:           uid,
		Source:               models.ModSourceSample,
		PackageSize:          int64(len(packageBytes)),
	})
	if err != nil {
		log.Println("InstallSample CreateMod error:", err)
		if strings.Contains(err.Error(), "UNIQUE") || strings.Contains(err.Error(), "unique") ||
			strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "Duplicate") {
			http.Error(w, "a mod with this slug already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := modengine.SavePackage(in.Slug, packageBytes); err != nil {
		log.Printf("InstallSample: save .kspm for %q: %v", in.Slug, err)
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryMod,
		Action:      "create",
		TargetLabel: in.Name,
		Message:     fmt.Sprintf("installed built-in sample %q (slug=%s, %d permission requests)", in.Name, in.Slug, len(in.PermissionsRequested)),
	})
	writeJSONStatus(w, http.StatusCreated, toModResponse(repo, mod))
}

package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/example/kspanel/internal/updatewin"
	"github.com/go-chi/chi/v5"
)

// ---- Scheduled update windows (cron + maintenance-window guard) ----
// Panel surface: GET/POST /api/system/update-windows(+/{wid}) gated
// MANAGE_PANEL_UPDATE at the route (target forced to 'panel').
// Fleet surface: GET/POST/PUT/DELETE /api/nodes/update-windows(+/{wid})
// gated MANAGE_NODES view/edit at the route (target forced to 'fleet').
// Every mutation is audit-logged. The scheduler sweep evaluates due rows
// once a minute: outside the window the run is SKIPPED + logged (never
// executed); inside, panel rows stage+relaunch via the shared stager and
// fleet rows run the rolling orchestrator — both detached.

type updateWindowDTO struct {
	Name        string `json:"name"`
	Cron        string `json:"cron"`
	Enabled     bool   `json:"enabled"`
	WindowStart string `json:"window_start"`
	WindowEnd   string `json:"window_end"`
}

func validateUpdateWindowDTO(dto *updateWindowDTO) error {
	dto.Name = strings.TrimSpace(dto.Name)
	dto.Cron = strings.TrimSpace(dto.Cron)
	dto.WindowStart = strings.TrimSpace(dto.WindowStart)
	dto.WindowEnd = strings.TrimSpace(dto.WindowEnd)
	if dto.Name == "" {
		return fmt.Errorf("name is required")
	}
	if len(dto.Name) > 64 {
		return fmt.Errorf("name too long (max 64 chars)")
	}
	if err := updatewin.ValidateCron(dto.Cron); err != nil {
		return err
	}
	if err := updatewin.ValidateWindow("window_start", dto.WindowStart); err != nil {
		return err
	}
	if err := updatewin.ValidateWindow("window_end", dto.WindowEnd); err != nil {
		return err
	}
	return nil
}

func updateWindowNextRun(cronExpr string) *time.Time {
	n := updatewin.NextRun(cronExpr, time.Now())
	if n.IsZero() {
		return nil
	}
	return &n
}

func decodeUpdateWindowDTO(w http.ResponseWriter, r *http.Request) (*updateWindowDTO, bool) {
	var dto updateWindowDTO
	if err := json.NewDecoder(io.LimitReader(r.Body, 64<<10)).Decode(&dto); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return nil, false
	}
	if err := validateUpdateWindowDTO(&dto); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return nil, false
	}
	return &dto, true
}

func listUpdateWindows(w http.ResponseWriter, target string) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	list, err := repository.NewUpdateWindowRepository(con).ListByTarget(target)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if list == nil {
		list = []repository.UpdateWindow{}
	}
	writeJSON(w, list)
}

func createUpdateWindow(w http.ResponseWriter, r *http.Request, target, auditAction string) {
	dto, ok := decodeUpdateWindowDTO(w, r)
	if !ok {
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	// A disabled window must never carry a next_run_at: Due() already
	// filters enabled=1, and a stale future/past stamp would fire
	// immediately on re-enable. Mirrors backup_schedule_handler updates.
	var next *time.Time
	if dto.Enabled {
		next = updateWindowNextRun(dto.Cron)
	}
	id, err := repository.NewUpdateWindowRepository(con).Create(repository.UpdateWindowInput{
		Target: target, Name: dto.Name, Cron: dto.Cron, Enabled: dto.Enabled,
		WindowStart: dto.WindowStart, WindowEnd: dto.WindowEnd,
		NextRunAt: next,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      auditAction,
		TargetLabel: dto.Name,
		Message:     fmt.Sprintf("created %s update window %q (%s, window %s–%s)", target, dto.Name, dto.Cron, dto.WindowStart, dto.WindowEnd),
	})
	writeJSONStatus(w, http.StatusCreated, map[string]any{"id": id})
}

func updateUpdateWindow(w http.ResponseWriter, r *http.Request, target, param, auditAction string) {
	id, err := strconv.ParseInt(chi.URLParam(r, param), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	dto, ok := decodeUpdateWindowDTO(w, r)
	if !ok {
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	// Same disabled-means-NULL contract as create above.
	var next *time.Time
	if dto.Enabled {
		next = updateWindowNextRun(dto.Cron)
	}
	if err := repository.NewUpdateWindowRepository(con).Update(id, repository.UpdateWindowInput{
		Target: target, Name: dto.Name, Cron: dto.Cron, Enabled: dto.Enabled,
		WindowStart: dto.WindowStart, WindowEnd: dto.WindowEnd,
		NextRunAt: next,
	}); err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      auditAction,
		TargetLabel: dto.Name,
		Message:     fmt.Sprintf("updated %s update window #%d %q (%s, window %s–%s)", target, id, dto.Name, dto.Cron, dto.WindowStart, dto.WindowEnd),
	})
	writeJSON(w, map[string]any{"id": id})
}

func deleteUpdateWindow(w http.ResponseWriter, r *http.Request, target, param, auditAction string) {
	id, err := strconv.ParseInt(chi.URLParam(r, param), 10, 64)
	if err != nil || id <= 0 {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewUpdateWindowRepository(con)
	existing, gerr := repo.Get(id, target)
	if gerr != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	if err := repo.Delete(id, target); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      auditAction,
		TargetLabel: existing.Name,
		Message:     fmt.Sprintf("deleted %s update window #%d %q", target, id, existing.Name),
	})
	writeJSON(w, map[string]any{"id": id})
}

// Panel surface (MANAGE_PANEL_UPDATE at the route).

func ListPanelUpdateWindowsHandler(w http.ResponseWriter, r *http.Request) {
	listUpdateWindows(w, updatewin.TargetPanel)
}

func CreatePanelUpdateWindowHandler(w http.ResponseWriter, r *http.Request) {
	createUpdateWindow(w, r, updatewin.TargetPanel, "panel_update_window_create")
}

func UpdatePanelUpdateWindowHandler(w http.ResponseWriter, r *http.Request) {
	updateUpdateWindow(w, r, updatewin.TargetPanel, "wid", "panel_update_window_update")
}

func DeletePanelUpdateWindowHandler(w http.ResponseWriter, r *http.Request) {
	deleteUpdateWindow(w, r, updatewin.TargetPanel, "wid", "panel_update_window_delete")
}

// Fleet surface (MANAGE_NODES view/edit at the route).

func ListFleetUpdateWindowsHandler(w http.ResponseWriter, r *http.Request) {
	listUpdateWindows(w, updatewin.TargetFleet)
}

func CreateFleetUpdateWindowHandler(w http.ResponseWriter, r *http.Request) {
	createUpdateWindow(w, r, updatewin.TargetFleet, "fleet_update_window_create")
}

func UpdateFleetUpdateWindowHandler(w http.ResponseWriter, r *http.Request) {
	updateUpdateWindow(w, r, updatewin.TargetFleet, "wid", "fleet_update_window_update")
}

func DeleteFleetUpdateWindowHandler(w http.ResponseWriter, r *http.Request) {
	deleteUpdateWindow(w, r, updatewin.TargetFleet, "wid", "fleet_update_window_delete")
}

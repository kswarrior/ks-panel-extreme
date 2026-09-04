package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

// GetTicketSLAConfigHandler returns the per-category SLA policy
// ({category: {first_response_mins, resolve_hours}}). Route-gated to
// tickets VIEW; the values are operational tuning, not secrets.
func GetTicketSLAConfigHandler(w http.ResponseWriter, r *http.Request) {
	if _, err := UserIDFromContext(r); err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	writeJSON(w, repository.NewTicketRepository(con).GetSLAConfig())
}

// UpdateTicketSLAConfigHandler persists the per-category SLA policy.
// Route-gated to tickets EDIT (staff); unknown categories and non-positive
// durations are rejected by the repository.
func UpdateTicketSLAConfigHandler(w http.ResponseWriter, r *http.Request) {
	if _, err := UserIDFromContext(r); err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	var cfg map[string]models.TicketSLAPolicy
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewTicketRepository(con)
	if err := repo.SetSLAConfig(cfg); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, repo.GetSLAConfig())
}

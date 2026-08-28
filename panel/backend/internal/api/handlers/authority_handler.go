package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
)

func AuthorityHandler(w http.ResponseWriter, r *http.Request) {
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()

	repo := repository.NewAuthorityRepository(con)

	switch r.Method {
	case http.MethodGet:
		cfg, err := repo.Get()
		if err != nil {
			log.Println("authority get:", err)
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, cfg)

	case http.MethodPut:
		var body models.AuthorityConfig
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}
		if err := repo.Update(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		configOut, err := repo.Get()
		if err != nil {
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		writeJSON(w, configOut)

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func AuthorityRegenerateAppSecretHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewAuthorityRepository(con)
	secret, err := repo.RegenerateAppSecret()
	if err != nil {
		log.Println("authority regen app secret:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"secret": secret})
}

package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

func isValidNotificationCategory(c string) bool {
	c = strings.ToLower(strings.TrimSpace(c))
	for _, v := range models.AllNotificationCategories {
		if string(v) == c {
			return true
		}
	}
	return false
}

func isValidNotificationPriority(p string) bool {
	p = strings.ToLower(strings.TrimSpace(p))
	for _, v := range models.AllNotificationPriorities {
		if string(v) == p {
			return true
		}
	}
	return false
}

// EmitNotification is the powerful internal helper any handler can call to
// create a notification for one user WITHOUT going through HTTP. It never
// returns an error to the caller as notification failures must not break the
// primary action (deploy, suspend, probe, …). Errors are logged.
func EmitNotification(userID int64, actorID *int64, actorName string, category models.NotificationCategory, priority models.NotificationPriority, title, message, link, actionLabel, metadata string) {
	EmitNotificationRich(userID, actorID, actorName, category, priority, title, message, link, actionLabel, metadata, "", "", "[]")
}

// EmitNotificationRich is the rich variant that also carries notes + cover image + media gallery (images/videos/gif).
func EmitNotificationRich(userID int64, actorID *int64, actorName string, category models.NotificationCategory, priority models.NotificationPriority, title, message, link, actionLabel, metadata, notes, coverImage, mediaJSON string) {
	if strings.TrimSpace(title) == "" {
		return
	}
	if category == "" {
		category = models.NotificationCategoryGeneral
	}
	if priority == "" {
		priority = models.NotificationPriorityNormal
	}
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("notification emit: open db:", err)
		return
	}
	defer con.Close()
	repo := repository.NewNotificationRepository(con)
	_, err = repo.Create(repository.CreateNotificationInput{
		UserID:      userID,
		ActorID:     actorID,
		ActorName:   actorName,
		Category:    category,
		Priority:    priority,
		Title:       title,
		Message:     message,
		Link:        link,
		ActionLabel: actionLabel,
		Metadata:    metadata,
		Notes:       notes,
		CoverImage:  coverImage,
		MediaJSON:   mediaJSON,
	})
	if err != nil {
		log.Println("notification emit: create:", err)
	}
}

// EmitBroadcast fans out a notification to every user. Intended for admin
// announcements, system updates, security alerts etc.
func EmitBroadcast(actorID *int64, actorName string, category models.NotificationCategory, priority models.NotificationPriority, title, message, link, actionLabel string) {
	EmitBroadcastRich(actorID, actorName, category, priority, title, message, link, actionLabel, "", "", "[]")
}

// EmitBroadcastRich is the rich broadcast variant with notes + cover + media.
func EmitBroadcastRich(actorID *int64, actorName string, category models.NotificationCategory, priority models.NotificationPriority, title, message, link, actionLabel, notes, coverImage, mediaJSON string) {
	if strings.TrimSpace(title) == "" {
		return
	}
	if category == "" {
		category = models.NotificationCategoryGeneral
	}
	if priority == "" {
		priority = models.NotificationPriorityNormal
	}
	con, err := repository.OpenDB()
	if err != nil {
		log.Println("notification broadcast: open db:", err)
		return
	}
	defer con.Close()
	repo := repository.NewNotificationRepository(con)
	ids, err := repo.ListAllUserIDs()
	if err != nil {
		log.Println("notification broadcast: list users:", err)
		return
	}
	for _, uid := range ids {
		_, _ = repo.Create(repository.CreateNotificationInput{
			UserID:      uid,
			ActorID:     actorID,
			ActorName:   actorName,
			Category:    category,
			Priority:    priority,
			Title:       title,
			Message:     message,
			Link:        link,
			ActionLabel: actionLabel,
			Notes:       notes,
			CoverImage:  coverImage,
			MediaJSON:   mediaJSON,
			IsBroadcast: true,
		})
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handlers — every authenticated user owns their inbox; cross-user ops
// require MANAGE_NOTIFICATIONS.
// ─────────────────────────────────────────────────────────────────────────────

// ListNotificationsHandler returns the caller's own notifications with filters.
func ListNotificationsHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNotificationRepository(con)

	f := repository.NotificationFilter{UserID: uid}
	f.Category = strings.ToLower(strings.TrimSpace(r.URL.Query().Get("category")))
	if f.Category != "" && !isValidNotificationCategory(f.Category) {
		http.Error(w, "invalid category", http.StatusBadRequest)
		return
	}
	f.Priority = strings.ToLower(strings.TrimSpace(r.URL.Query().Get("priority")))
	if f.Priority != "" && !isValidNotificationPriority(f.Priority) {
		http.Error(w, "invalid priority", http.StatusBadRequest)
		return
	}
	if v := r.URL.Query().Get("is_read"); v != "" {
		b := v == "true" || v == "1"
		f.IsRead = &b
		if v == "false" || v == "0" {
			bo := false
			f.IsRead = &bo
		}
		if v == "true" || v == "1" {
			bo := true
			f.IsRead = &bo
		}
	}
	f.Search = r.URL.Query().Get("q")
	if v := r.URL.Query().Get("search"); v != "" && f.Search == "" {
		f.Search = v
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, perr := strconv.Atoi(v); perr == nil && n > 0 && n <= 100 {
			f.Limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, perr := strconv.Atoi(v); perr == nil && n >= 0 {
			f.Offset = n
		}
	}

	rows, total, err := repo.List(f)
	if err != nil {
		log.Println("ListNotifications error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if rows == nil {
		rows = []models.Notification{}
	}
	w.Header().Set("X-Total-Count", strconv.Itoa(total))
	writeJSON(w, rows)
}

// GetNotificationHandler returns one notification if it belongs to the caller.
func GetNotificationHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNotificationRepository(con)
	n, err := repo.Get(id, uid)
	if err != nil {
		log.Println("GetNotification error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if n == nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	writeJSON(w, n)
}

// UnreadCountHandler returns the badge number { unread: N }.
func UnreadCountHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNotificationRepository(con)
	n, err := repo.UnreadCount(uid)
	if err != nil {
		log.Println("UnreadCount error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]int{"unread": n})
}

// StatsHandler returns aggregated totals for header chips/dashboard.
func NotificationStatsHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNotificationRepository(con)
	s, err := repo.Stats(uid)
	if err != nil {
		log.Println("NotificationStats error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, s)
}

type createNotificationRequest struct {
	UserID      *int64 `json:"user_id,omitempty"`
	Category    string `json:"category"`
	Priority    string `json:"priority"`
	Title       string `json:"title"`
	Message     string `json:"message"`
	Link        string `json:"link,omitempty"`
	ActionLabel string `json:"action_label,omitempty"`
	Metadata    string `json:"metadata,omitempty"`
	Notes       string `json:"notes,omitempty"`
	CoverImage  string `json:"cover_image,omitempty"`
	MediaJSON   string `json:"media_json,omitempty"`
	// Media as structured array [{type,url}] — alternative to MediaJSON string, accepted for convenience
	Media       []struct {
		Type string `json:"type"`
		URL  string `json:"url"`
	} `json:"media,omitempty"`
	Broadcast bool `json:"broadcast,omitempty"`
}

// CreateNotificationHandler creates a notification for a specific user or
// broadcasts to all users. Requires MANAGE_NOTIFICATIONS (checked in server.go).
func CreateNotificationHandler(w http.ResponseWriter, r *http.Request) {
	actorID, _ := UserIDFromContext(r)
	var actorName string
	if u, role, ok := currentUserFromContext(r.Context()); ok && u != nil {
		actorName = u.Username
		_ = role
	} else if actorID != 0 {
		// fallback: resolve username via DB
		if con, err := repository.OpenDB(); err == nil {
			if repo := repository.NewUserRepository(con); repo != nil {
				if u, err := repo.GetByID(actorID); err == nil && u != nil {
					actorName = u.Username
				}
			}
			con.Close()
		}
	}
	var req createNotificationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid payload", http.StatusBadRequest)
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		http.Error(w, "title is required", http.StatusBadRequest)
		return
	}
	if len(req.Title) > 500 {
		http.Error(w, "title must be 500 characters or fewer", http.StatusBadRequest)
		return
	}
	if len(req.Message) > 5000 {
		http.Error(w, "message must be 5000 characters or fewer", http.StatusBadRequest)
		return
	}
	if len(req.Link) > 1000 {
		http.Error(w, "link must be 1000 characters or fewer", http.StatusBadRequest)
		return
	}
	if ll := strings.ToLower(strings.TrimSpace(req.Link)); ll != "" {
		if strings.HasPrefix(ll, "javascript:") || strings.HasPrefix(ll, "data:") || strings.HasPrefix(ll, "vbscript:") || strings.HasPrefix(ll, "file:") {
			http.Error(w, "link must not use javascript/data scheme", http.StatusBadRequest)
			return
		}
	}
	if len(req.ActionLabel) > 255 {
		http.Error(w, "action_label must be 255 characters or fewer", http.StatusBadRequest)
		return
	}
	if len(req.Metadata) > 5000 {
		http.Error(w, "metadata must be 5000 characters or fewer", http.StatusBadRequest)
		return
	}
	if len(req.Notes) > 8000 {
		http.Error(w, "notes must be 8000 characters or fewer", http.StatusBadRequest)
		return
	}
	if len(req.CoverImage) > 2000 {
		http.Error(w, "cover_image must be 2000 characters or fewer", http.StatusBadRequest)
		return
	}
	if ll := strings.ToLower(strings.TrimSpace(req.CoverImage)); ll != "" {
		if strings.HasPrefix(ll, "javascript:") || strings.HasPrefix(ll, "data:") || strings.HasPrefix(ll, "vbscript:") || strings.HasPrefix(ll, "file:") {
			http.Error(w, "cover_image must not use javascript/data scheme", http.StatusBadRequest)
			return
		}
	}
	// Resolve media_json: prefer structured Media array if provided
	mediaJSON := strings.TrimSpace(req.MediaJSON)
	if len(req.Media) > 0 {
		if len(req.Media) > 20 {
			http.Error(w, "media must have at most 20 items", http.StatusBadRequest)
			return
		}
		for _, m := range req.Media {
			if len(m.URL) > 2000 {
				http.Error(w, "media url must be 2000 characters or fewer", http.StatusBadRequest)
				return
			}
			ll := strings.ToLower(strings.TrimSpace(m.URL))
			if strings.HasPrefix(ll, "javascript:") || strings.HasPrefix(ll, "data:") || strings.HasPrefix(ll, "vbscript:") || strings.HasPrefix(ll, "file:") {
				http.Error(w, "media url must not use javascript/data scheme", http.StatusBadRequest)
				return
			}
			if m.Type != "" && m.Type != "image" && m.Type != "video" && m.Type != "gif" {
				http.Error(w, "media type must be image, video or gif", http.StatusBadRequest)
				return
			}
		}
		if b, err := json.Marshal(req.Media); err == nil {
			mediaJSON = string(b)
		}
	} else if mediaJSON != "" {
		// Validate it is valid JSON array
		var arr []interface{}
		if err := json.Unmarshal([]byte(mediaJSON), &arr); err != nil {
			http.Error(w, "media_json must be a valid JSON array", http.StatusBadRequest)
			return
		}
		if len(arr) > 20 {
			http.Error(w, "media_json must have at most 20 items", http.StatusBadRequest)
			return
		}
	}
	if mediaJSON == "" {
		mediaJSON = "[]"
	}
	if len(mediaJSON) > 20000 {
		http.Error(w, "media_json must be 20000 characters or fewer", http.StatusBadRequest)
		return
	}
	cat := models.NotificationCategory(strings.ToLower(strings.TrimSpace(req.Category)))
	if cat == "" {
		cat = models.NotificationCategoryGeneral
	} else if !isValidNotificationCategory(string(cat)) {
		http.Error(w, "invalid category", http.StatusBadRequest)
		return
	}
	pri := models.NotificationPriority(strings.ToLower(strings.TrimSpace(req.Priority)))
	if pri == "" {
		pri = models.NotificationPriorityNormal
	} else if !isValidNotificationPriority(string(pri)) {
		http.Error(w, "invalid priority", http.StatusBadRequest)
		return
	}

	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNotificationRepository(con)

	// Broadcast path
	if req.Broadcast {
		ids, err := repo.ListAllUserIDs()
		if err != nil {
			log.Println("CreateNotification broadcast list users:", err)
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		if len(ids) == 0 {
			writeJSON(w, map[string]interface{}{"ids": []int64{}, "broadcast": true})
			return
		}
		var actorPtr *int64
		if actorID != 0 {
			actorPtr = &actorID
		}
		fanned, err := repo.CreateBroadcast(repository.CreateNotificationInput{
			ActorID:     actorPtr,
			ActorName:   actorName,
			Category:    cat,
			Priority:    pri,
			Title:       req.Title,
			Message:     req.Message,
			Link:        req.Link,
			ActionLabel: req.ActionLabel,
			Metadata:    req.Metadata,
			Notes:       req.Notes,
			CoverImage:  req.CoverImage,
			MediaJSON:   mediaJSON,
		}, ids)
		if err != nil {
			log.Println("CreateNotification broadcast error:", err)
			http.Error(w, "server error", http.StatusInternalServerError)
			return
		}
		RecordActivity(r, repository.ActivityInput{
			Category:    models.ActivityCategorySystem,
			Action:      "notify_broadcast",
			TargetLabel: req.Title,
			Message:     "broadcast notification: " + req.Title,
		})
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, map[string]interface{}{"ids": fanned, "broadcast": true, "count": len(fanned)})
		return
	}

	// Single-user path: require user_id
	if req.UserID == nil || *req.UserID == 0 {
		http.Error(w, "user_id is required (or set broadcast=true)", http.StatusBadRequest)
		return
	}
	// Verify target user exists
	userRepo := repository.NewUserRepository(con)
	if _, err := userRepo.GetByID(*req.UserID); err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "target user not found", http.StatusNotFound)
			return
		}
		log.Println("CreateNotification get user:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	var actorPtr *int64
	if actorID != 0 {
		actorPtr = &actorID
	}
	id, err := repo.Create(repository.CreateNotificationInput{
		UserID:      *req.UserID,
		ActorID:     actorPtr,
		ActorName:   actorName,
		Category:    cat,
		Priority:    pri,
		Title:       req.Title,
		Message:     req.Message,
		Link:        req.Link,
		ActionLabel: req.ActionLabel,
		Metadata:    req.Metadata,
		Notes:       req.Notes,
		CoverImage:  req.CoverImage,
		MediaJSON:   mediaJSON,
	})
	if err != nil {
		log.Println("CreateNotification error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategorySystem,
		Action:      "notify_create",
		TargetID:    &id,
		TargetLabel: req.Title,
		Message:     "created notification: " + req.Title,
	})
	w.WriteHeader(http.StatusCreated)
	writeJSON(w, map[string]interface{}{"id": id})
}

// MarkReadHandler flips one notification to read if it belongs to caller.
func MarkReadHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNotificationRepository(con)
	if err := repo.MarkRead(id, uid); err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		log.Println("MarkRead error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"status": "ok"})
}

// MarkAllReadHandler marks every unread for caller as read.
func MarkAllReadHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNotificationRepository(con)
	n, err := repo.MarkAllRead(uid)
	if err != nil {
		log.Println("MarkAllRead error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]interface{}{"status": "ok", "marked": n})
}

// DeleteNotificationHandler deletes one row if it belongs to caller.
func DeleteNotificationHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNotificationRepository(con)
	if err := repo.Delete(id, uid); err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		log.Println("DeleteNotification error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ClearNotificationsHandler deletes (all or only-read) for caller.
func ClearNotificationsHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	onlyRead := r.URL.Query().Get("only_read") == "true" || r.URL.Query().Get("only_read") == "1"
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	repo := repository.NewNotificationRepository(con)
	n, err := repo.DeleteAll(uid, onlyRead)
	if err != nil {
		log.Println("ClearNotifications error:", err)
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]interface{}{"deleted": n})
}

package handlers

import (
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"

	"github.com/example/kspanel/internal/models"
	"github.com/example/kspanel/internal/repository"
	"github.com/go-chi/chi/v5"
)

// loadTicketForAttachment loads the ticket and enforces the same
// owner-vs-staff visibility as GetTicketHandler: staff (MANAGE_TICKETS)
// sees any ticket, everyone else only own-or-assigned.
func loadTicketForAttachment(con *sql.DB, uid, ticketID int64) (*models.Ticket, error) {
	repo := repository.NewTicketRepository(con)
	tk, err := repo.Get(ticketID)
	if err != nil {
		return nil, fmt.Errorf("ticket not found")
	}
	if !isTicketStaff(con, uid) {
		if tk.CreatedBy != uid && (tk.AssignedTo == nil || *tk.AssignedTo != uid) {
			return nil, fmt.Errorf("forbidden")
		}
	}
	return tk, nil
}

func ticketAttachmentAccessError(w http.ResponseWriter, err error) bool {
	if err == nil {
		return false
	}
	switch err.Error() {
	case "forbidden":
		http.Error(w, "forbidden", http.StatusForbidden)
	case "ticket not found":
		http.Error(w, "ticket not found", http.StatusNotFound)
	default:
		http.Error(w, err.Error(), http.StatusBadRequest)
	}
	return true
}

// ListTicketAttachmentsHandler returns every attachment on a ticket.
func ListTicketAttachmentsHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	ticketID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
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
	if _, aerr := loadTicketForAttachment(con, uid, ticketID); ticketAttachmentAccessError(w, aerr) {
		return
	}
	atts, err := repository.NewTicketRepository(con).ListAttachments(ticketID)
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	if atts == nil {
		atts = []models.TicketAttachment{}
	}
	writeJSON(w, atts)
}

// UploadTicketAttachmentHandler accepts one multipart "file" part (25 MiB
// cap, images/pdf/zip/log allowlist, SHA256 dedupe per ticket). Optional
// "comment_id" form field links the upload to a chat message.
func UploadTicketAttachmentHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	ticketID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
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
	tk, aerr := loadTicketForAttachment(con, uid, ticketID)
	if ticketAttachmentAccessError(w, aerr) {
		return
	}
	if tk.Status == "closed" {
		http.Error(w, "cannot attach to a closed ticket", http.StatusBadRequest)
		return
	}
	// Cap the whole body slightly above the 25 MiB file cap so the handler
	// (not the middleware) reports the friendly 413.
	r.Body = http.MaxBytesReader(w, r.Body, models.MaxTicketAttachmentBytes+2<<20)
	if err := r.ParseMultipartForm(models.MaxTicketAttachmentBytes + 2<<20); err != nil {
		http.Error(w, "file too large (max 25 MiB)", http.StatusRequestEntityTooLarge)
		return
	}
	file, hdr, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "missing 'file' part", http.StatusBadRequest)
		return
	}
	defer file.Close()
	if hdr.Size > models.MaxTicketAttachmentBytes {
		http.Error(w, "file too large (max 25 MiB)", http.StatusRequestEntityTooLarge)
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, models.MaxTicketAttachmentBytes+1))
	if err != nil {
		http.Error(w, "read file: "+err.Error(), http.StatusBadRequest)
		return
	}
	if int64(len(data)) > models.MaxTicketAttachmentBytes {
		http.Error(w, "file too large (max 25 MiB)", http.StatusRequestEntityTooLarge)
		return
	}
	name := hdr.Filename
	if name == "" {
		name = "file"
	}
	var commentID *int64
	if raw := r.FormValue("comment_id"); raw != "" {
		if cid, cerr := strconv.ParseInt(raw, 10, 64); cerr == nil && cid > 0 {
			// The comment must belong to this ticket, otherwise a crafted
			// comment_id could link the upload to another ticket's thread.
			if c, gerr := repository.NewTicketRepository(con).GetComment(cid); gerr == nil && c.TicketID == ticketID {
				commentID = &cid
			} else {
				http.Error(w, "comment not found on this ticket", http.StatusBadRequest)
				return
			}
		}
	}
	repo := repository.NewTicketRepository(con)
	// Dedupe pre-check so a re-upload answers 200 + existing row instead
	// of 201 (the repo re-checks under the same call for races).
	if dup, _ := repo.GetAttachmentBySHA(ticketID, repository.SHA256Hex(data)); dup != nil {
		writeJSON(w, dup)
		return
	}
	att, err := repo.CreateAttachment(ticketID, commentID, name, data, uid)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTicket,
		Action:      "attach",
		TargetID:    &ticketID,
		TargetLabel: tk.TicketNo,
		Message:     fmt.Sprintf("attached %s to ticket %s", att.FileName, tk.TicketNo),
	})
	writeJSONStatus(w, http.StatusCreated, att)
}

// DownloadTicketAttachmentHandler streams the bytes inline (images/pdf
// render in the browser; the frontend forces download for zip/log via the
// download attribute). The attId must belong to the ticket in the path
// (IDOR guard) and the caller must see the ticket.
func DownloadTicketAttachmentHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	ticketID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	attID, err := strconv.ParseInt(chi.URLParam(r, "attId"), 10, 64)
	if err != nil {
		http.Error(w, "invalid attachment id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	if _, aerr := loadTicketForAttachment(con, uid, ticketID); ticketAttachmentAccessError(w, aerr) {
		return
	}
	repo := repository.NewTicketRepository(con)
	att, err := repo.GetAttachment(attID)
	if err != nil || att.TicketID != ticketID {
		http.Error(w, "attachment not found", http.StatusNotFound)
		return
	}
	f, err := os.Open(repository.AttachmentPath(att))
	if err != nil {
		http.Error(w, "attachment bytes missing", http.StatusNotFound)
		return
	}
	defer f.Close()
	w.Header().Set("Content-Type", att.Mime)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename=%q`, att.FileName))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, att.FileName, att.CreatedAt, f)
}

// DeleteTicketAttachmentHandler removes the row + bytes. The uploader or
// staff may delete; on closed tickets only staff (mirrors comment delete).
func DeleteTicketAttachmentHandler(w http.ResponseWriter, r *http.Request) {
	uid, err := UserIDFromContext(r)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	ticketID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	attID, err := strconv.ParseInt(chi.URLParam(r, "attId"), 10, 64)
	if err != nil {
		http.Error(w, "invalid attachment id", http.StatusBadRequest)
		return
	}
	con, err := repository.OpenDB()
	if err != nil {
		http.Error(w, "server error", http.StatusInternalServerError)
		return
	}
	defer con.Close()
	tk, aerr := loadTicketForAttachment(con, uid, ticketID)
	if ticketAttachmentAccessError(w, aerr) {
		return
	}
	repo := repository.NewTicketRepository(con)
	att, err := repo.GetAttachment(attID)
	if err != nil || att.TicketID != ticketID {
		http.Error(w, "attachment not found", http.StatusNotFound)
		return
	}
	isStaff := canSeeInternal(con, uid)
	if att.UploadedBy != uid && !isStaff {
		http.Error(w, "forbidden", http.StatusForbidden)
		return
	}
	if tk.Status == "closed" && !isStaff {
		http.Error(w, "cannot delete attachment on closed ticket", http.StatusBadRequest)
		return
	}
	if _, err := repo.DeleteAttachment(attID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	RecordActivity(r, repository.ActivityInput{
		Category:    models.ActivityCategoryTicket,
		Action:      "detach",
		TargetID:    &ticketID,
		TargetLabel: tk.TicketNo,
		Message:     fmt.Sprintf("removed attachment %s from ticket %s", att.FileName, tk.TicketNo),
	})
	w.WriteHeader(http.StatusNoContent)
}

package repository

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/models"
)

// ticketAttachmentsDir returns <DataDir>/ticket_attachments/<ticketID>,
// creating it on demand. Bytes live on disk (like panel logos); the DB row
// is only metadata (065 ticket_attachments).
func ticketAttachmentsDir(ticketID int64) (string, error) {
	dir := filepath.Join(config.DataDir(), "ticket_attachments", fmt.Sprintf("%d", ticketID))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create attachments dir: %w", err)
	}
	return dir, nil
}

// sanitizeAttachmentName strips directories and clamps the alphabet so the
// on-disk name can never escape the ticket dir or smuggle shell metachars.
func sanitizeAttachmentName(name string) string {
	base := filepath.Base(strings.TrimSpace(name))
	if base == "" || base == "." || base == "/" {
		return "file"
	}
	var b strings.Builder
	for _, r := range base {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9',
			r == '.', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteByte('_')
		}
	}
	out := b.String()
	if len(out) > 128 {
		ext := filepath.Ext(out)
		out = out[:128-len(ext)] + ext
	}
	if out == "" {
		return "file"
	}
	return out
}

// SHA256Hex returns the lowercase hex SHA256 of data (dedupe key).
func SHA256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// ValidateAttachment checks size + MIME allowlist + sniff-vs-extension
// family match. It returns the normalised MIME to store.
func ValidateAttachment(fileName string, size int64, data []byte) (string, error) {
	if size <= 0 {
		return "", fmt.Errorf("file is empty")
	}
	if size > models.MaxTicketAttachmentBytes {
		return "", fmt.Errorf("file exceeds 25 MiB cap")
	}
	sniffed := http.DetectContentType(data)
	// Normalise the sniff: DetectContentType returns "text/plain;
	// charset=utf-8" for logs — strip parameters for the allowlist check.
	mime := strings.ToLower(strings.TrimSpace(strings.SplitN(sniffed, ";", 2)[0]))
	// SVG sniffs as text/xml or text/html, never as image/svg+xml. When
	// the extension claims .svg and the sniff is xml/html/text-ish, treat
	// it as svg so vector uploads aren't rejected by the sniffer.
	ext := strings.ToLower(filepath.Ext(fileName))
	if ext == ".svg" && (mime == "text/xml" || mime == "text/html" || mime == "text/plain" || mime == "image/svg+xml") {
		mime = "image/svg+xml"
	}
	if !models.ValidTicketAttachmentMIMEs[mime] {
		return "", fmt.Errorf("file type %q is not allowed (images, pdf, zip, log only)", mime)
	}
	// Extension-vs-content family check: a .png that sniffs as text (or a
	// .log that sniffs as an image) is rejected so a renamed executable
	// can't ride in under a friendly name.
	if ext != "" && !attachmentExtMatchesMime(ext, mime) {
		return "", fmt.Errorf("file extension %q does not match content type %q", ext, mime)
	}
	return mime, nil
}

func attachmentExtMatchesMime(ext, mime string) bool {
	switch {
	case strings.HasPrefix(mime, "image/"):
		switch ext {
		case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg":
			return true
		}
		// svg sniffs as text/xml or image/svg+xml depending on content;
		// DetectContentType reports svg as text/xml or text/plain — allow
		// .svg only when the sniff is svg or xml-ish.
		return false
	case mime == "application/pdf":
		return ext == ".pdf"
	case mime == "application/zip" || mime == "application/x-zip-compressed":
		return ext == ".zip"
	case mime == "text/plain" || mime == "text/x-log":
		switch ext {
		case ".txt", ".log", ".md", ".csv", ".json", ".xml", ".svg", "":
			return true
		}
		return false
	}
	return false
}

// CreateAttachment stores data on disk (deduped by sha256 per ticket) and
// inserts the metadata row. A re-upload of identical bytes to the SAME
// ticket returns the existing row without writing a second copy.
func (r *TicketRepository) CreateAttachment(ticketID int64, commentID *int64, fileName string, data []byte, uploadedBy int64) (*models.TicketAttachment, error) {
	mime, err := ValidateAttachment(fileName, int64(len(data)), data)
	if err != nil {
		return nil, err
	}
	sum := SHA256Hex(data)
	hexSum := sum

	// Dedupe: same bytes on the same ticket → return the existing row.
	if existing, err := r.GetAttachmentBySHA(ticketID, hexSum); err == nil && existing != nil {
		return existing, nil
	}

	now := time.Now().UTC().Format("2006-01-02 15:04:05")
	safe := sanitizeAttachmentName(fileName)
	// execInsertGetID resolves the id portably (RETURNING id on Postgres,
	// LastInsertId elsewhere with the error propagated, never swallowed).
	var id int64
	if commentID == nil {
		id, err = r.execInsertGetID(
			`INSERT INTO ticket_attachments (ticket_id, comment_id, file_name, mime, size_bytes, sha256, uploaded_by, created_at)
			 VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`,
			ticketID, safe, mime, len(data), hexSum, uploadedBy, now,
		)
	} else {
		id, err = r.execInsertGetID(
			`INSERT INTO ticket_attachments (ticket_id, comment_id, file_name, mime, size_bytes, sha256, uploaded_by, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			ticketID, *commentID, safe, mime, len(data), hexSum, uploadedBy, now,
		)
	}
	if err != nil {
		return nil, err
	}
	dir, err := ticketAttachmentsDir(ticketID)
	if err != nil {
		_, _ = r.db.Exec(r.rebind(`DELETE FROM ticket_attachments WHERE id = ?`), id)
		return nil, err
	}
	dst := filepath.Join(dir, fmt.Sprintf("%d-%s-%s", id, hexSum[:12], safe))
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		_, _ = r.db.Exec(r.rebind(`DELETE FROM ticket_attachments WHERE id = ?`), id)
		return nil, fmt.Errorf("write attachment: %w", err)
	}
	return r.GetAttachment(id)
}

// AttachmentPath returns the on-disk path for a metadata row.
func AttachmentPath(a *models.TicketAttachment) string {
	dir := filepath.Join(config.DataDir(), "ticket_attachments", fmt.Sprintf("%d", a.TicketID))
	return filepath.Join(dir, fmt.Sprintf("%d-%s-%s", a.ID, shortSHA(a.SHA256), sanitizeAttachmentName(a.FileName)))
}

func shortSHA(hexSum string) string {
	if len(hexSum) >= 12 {
		return hexSum[:12]
	}
	return hexSum
}

func scanAttachment(scanner interface{ Scan(...any) error }) (*models.TicketAttachment, error) {
	var a models.TicketAttachment
	var commentID sql.NullInt64
	var fileName, mime, hexSum sql.NullString
	var created sql.NullString
	if err := scanner.Scan(&a.ID, &a.TicketID, &commentID, &fileName, &mime, &a.SizeBytes, &hexSum, &a.UploadedBy, &created); err != nil {
		return nil, err
	}
	if commentID.Valid {
		v := commentID.Int64
		a.CommentID = &v
	}
	a.FileName = fileName.String
	a.Mime = mime.String
	a.SHA256 = hexSum.String
	a.CreatedAt = parseTicketTime(created.String)
	return &a, nil
}

const attachmentColumns = `id, ticket_id, comment_id, file_name, mime, size_bytes, sha256, uploaded_by, created_at`

// GetAttachment returns one attachment row by id.
func (r *TicketRepository) GetAttachment(id int64) (*models.TicketAttachment, error) {
	row := r.db.QueryRow(r.rebind(`SELECT `+attachmentColumns+` FROM ticket_attachments WHERE id = ?`), id)
	a, err := scanAttachment(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("attachment not found")
		}
		return nil, err
	}
	return a, nil
}

// GetAttachmentBySHA returns the existing row for identical bytes on a
// ticket, or (nil, nil) when no duplicate exists.
func (r *TicketRepository) GetAttachmentBySHA(ticketID int64, hexSum string) (*models.TicketAttachment, error) {
	row := r.db.QueryRow(r.rebind(`SELECT `+attachmentColumns+` FROM ticket_attachments WHERE ticket_id = ? AND sha256 = ? ORDER BY id ASC LIMIT 1`), ticketID, hexSum)
	a, err := scanAttachment(row)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return a, nil
}

// ListAttachments returns every attachment on a ticket, oldest first.
func (r *TicketRepository) ListAttachments(ticketID int64) ([]models.TicketAttachment, error) {
	rows, err := r.db.Query(r.rebind(`SELECT `+attachmentColumns+` FROM ticket_attachments WHERE ticket_id = ? ORDER BY created_at ASC, id ASC`), ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.TicketAttachment{}
	for rows.Next() {
		a, err := scanAttachment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

// DeleteAttachment removes the row + the on-disk bytes. Missing bytes are
// tolerated (best-effort cleanup) so a manually-pruned dir can't brick the
// API.
func (r *TicketRepository) DeleteAttachment(id int64) (*models.TicketAttachment, error) {
	a, err := r.GetAttachment(id)
	if err != nil {
		return nil, err
	}
	if _, err := r.db.Exec(r.rebind(`DELETE FROM ticket_attachments WHERE id = ?`), id); err != nil {
		return nil, err
	}
	_ = os.Remove(AttachmentPath(a))
	return a, nil
}

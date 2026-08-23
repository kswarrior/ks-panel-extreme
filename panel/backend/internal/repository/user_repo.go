package repository

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/example/kspanel/internal/config"
	"github.com/example/kspanel/internal/models"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

// userCols is the canonical column list + scan target for a fully-populated
// User row, including the profile columns added by migration 018 and
// suspension columns added by migration 037. Keeping it in one place means
// every read path (GetByID / GetByUsername / ...) returns the same shape;
// the only difference between them is the WHERE clause.
const userCols = `id, username, email, password_hash, role_id, created_at,
	suspended, suspended_until, suspension_count, suspension_history,
	display_name, bio, pronouns, accent_color, avatar_symbol,
	avatar_mime, avatar_filename, banner_mime, banner_filename, social_links`

func (r *UserRepository) CreateUser(u models.User) error {
	if u.Username == "" || u.Email == "" || u.PasswordHash == "" || u.RoleID == 0 {
		return fmt.Errorf("missing required user fields")
	}
	_, err := r.db.Exec(`INSERT INTO users (username, email, password_hash, role_id) VALUES (?, ?, ?, ?)`,
		u.Username, u.Email, u.PasswordHash, u.RoleID)
	return err
}

// ListUsers returns every user, without their password hash.
func (r *UserRepository) ListUsers() ([]models.User, error) {
	rows, err := r.db.Query(`SELECT ` + userCols + ` FROM users ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []models.User{}
	for rows.Next() {
		var u models.User
		var createdAt sql.NullString
		if err := scanUserProfile(rows, &u, &createdAt); err != nil {
			return nil, err
		}
		if createdAt.Valid {
			u.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt.String)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (r *UserRepository) GetByUsername(username string) (*models.User, error) {
	row := r.db.QueryRow(`SELECT `+userCols+` FROM users WHERE username = ?`, username)
	return scanUserProfileRow(row)
}

// GetByUsernameOrEmail looks up a user by either its username or its email.
// This is used by the login flow so users may sign in with whichever they
// prefer. The match is case-sensitive on the username and case-insensitive
// on the email (e.g. `User@Example.com` == `user@example.com`), matching the
// common convention that emails are case-insensitive but usernames are not.
func (r *UserRepository) GetByUsernameOrEmail(identifier string) (*models.User, error) {
	row := r.db.QueryRow(
		`SELECT `+userCols+`
		 FROM users
		 WHERE username = ? OR lower(email) = lower(?)`,
		identifier, identifier,
	)
	return scanUserProfileRow(row)
}

// GetByID returns a user by numeric ID.
func (r *UserRepository) GetByID(id int64) (*models.User, error) {
	row := r.db.QueryRow(`SELECT `+userCols+` FROM users WHERE id = ?`, id)
	return scanUserProfileRow(row)
}

// AdminCreateUser inserts a new user from the admin API. It mirrors CreateUser
// but is named separately so the intent is explicit at the call site.
func (r *UserRepository) AdminCreateUser(u models.User) error {
	return r.CreateUser(u)
}

// UpdateUser updates editable fields. passwordHash empty => leave unchanged.
func (r *UserRepository) UpdateUser(id int64, username, email string, roleID int64, passwordHash string) error {
	if passwordHash == "" {
		_, err := r.db.Exec(
			`UPDATE users SET username = ?, email = ?, role_id = ? WHERE id = ?`,
			username, email, roleID, id,
		)
		return err
	}
	_, err := r.db.Exec(
		`UPDATE users SET username = ?, email = ?, role_id = ?, password_hash = ? WHERE id = ?`,
		username, email, roleID, passwordHash, id,
	)
	return err
}

// DeleteUser removes a user. It refuses to let a caller delete themselves
// (callerID == id) to avoid accidentally locking oneself out of the panel.
// It also best-effort removes the user's on-disk image directory so we don't
// leak orphan avatar/banner files after the row is gone.
func (r *UserRepository) DeleteUser(id, callerID int64) error {
	if id == callerID {
		return fmt.Errorf("cannot delete your own account")
	}
	res, err := r.db.Exec(`DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return fmt.Errorf("user not found")
	}
	// Best-effort cleanup of the per-user image directory on disk. Errors
	// are swallowed: a missing dir (nothing was ever uploaded) returns
	// os.ErrNotExist which is harmless here.
	_ = os.RemoveAll(userImageDir(id))
	return nil
}

// UpdateUsername renames the user. callerID is unused here (any user can rename
// themselves; admins can rename anyone via UpdateUser).
func (r *UserRepository) UpdateUsername(id int64, username string, _ int64) error {
	if username == "" {
		return fmt.Errorf("username is required")
	}
	res, err := r.db.Exec(`UPDATE users SET username = ? WHERE id = ?`, username, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

// UpdatePassword replaces the password hash.
func (r *UserRepository) UpdatePassword(id int64, passwordHash string) error {
	if passwordHash == "" {
		return fmt.Errorf("password hash is required")
	}
	res, err := r.db.Exec(`UPDATE users SET password_hash = ? WHERE id = ?`, passwordHash, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

// ── Profile updates (migration 018) ──────────────────────────────────────

// UpdateProfile overwrites the scalar profile fields for the given user. The
// caller passes the already-validated values; this method does no length
// policing (that lives in the HTTP handler so we can return a clean 400 with
// the offending field name). An empty string is a legitimate "clear" for
// every field here, so we always persist.
func (r *UserRepository) UpdateProfile(id int64, displayName, bio, pronouns, accentColor, avatarSymbol string, socialLinks []models.SocialLink) error {
	linksJSON, err := json.Marshal(socialLinks)
	if err != nil {
		return fmt.Errorf("encode social links: %w", err)
	}
	res, err := r.db.Exec(
		`UPDATE users SET
			display_name = ?, bio = ?, pronouns = ?,
			accent_color = ?, avatar_symbol = ?, social_links = ?
		 WHERE id = ?`,
		displayName, bio, pronouns, accentColor, avatarSymbol, string(linksJSON), id,
	)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return fmt.Errorf("user not found")
	}
	return nil
}

// SetUserImage stores either the avatar or the banner bytes for a user on
// disk and updates the matching *_mime + *_filename columns. The kind
// argument selects which ("avatar" or "banner"); any other value returns an
// error. The on-disk layout mirrors the panel-logo pattern: <datadir>/users/
// <id>/<kind>-<random>.<ext>. The previous file (if any) is removed after
// the DB write succeeds so an interrupted write can't leave the row pointing
// at a missing file.
func (r *UserRepository) SetUserImage(id int64, kind string, data []byte, mime string) (filename string, err error) {
	if kind != "avatar" && kind != "banner" {
		return "", fmt.Errorf("unknown image kind %q", kind)
	}
	if len(data) == 0 {
		return "", fmt.Errorf("image file is empty")
	}
	if mime == "" {
		return "", fmt.Errorf("image mime type is required")
	}
	ext := imageExtensionForMime(mime)
	if ext == "" {
		return "", fmt.Errorf("unsupported image mime type %q", mime)
	}

	mimeCol := kind + "_mime"
	filenameCol := kind + "_filename"

	prev, _, _ := r.getUserImage(id, kind)

	dir := userImageDir(id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("create user image dir: %w", err)
	}
	filename = kind + "-" + randHex(8) + ext
	dst := filepath.Join(dir, filename)
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		return "", fmt.Errorf("write %s file: %w", kind, err)
	}

	// SQLite doesn't parameterize column names, so build the UPDATE inline.
	// Both column names are hard-coded constants (no user input) so there's
	// no injection surface.
	res, err := r.db.Exec(
		fmt.Sprintf(`UPDATE users SET %s = ?, %s = ? WHERE id = ?`, mimeCol, filenameCol),
		mime, filename, id,
	)
	if err != nil {
		_ = os.Remove(dst)
		return "", fmt.Errorf("persist %s meta: %w", kind, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		_ = os.Remove(dst)
		return "", fmt.Errorf("user not found")
	}

	// Best-effort cleanup of the previous file (if it wasn't the one we
	// just wrote — they can't collide because the filename carries random
	// hex). Swallows errors: worst case is a small orphan in the dir.
	if prev.Filename != "" && prev.Filename != filename {
		_ = os.Remove(filepath.Join(dir, prev.Filename))
	}
	return filename, nil
}

// ClearUserImage drops the avatar/banner columns and removes its on-disk
// file. No-op when none is configured.
func (r *UserRepository) ClearUserImage(id int64, kind string) error {
	if kind != "avatar" && kind != "banner" {
		return fmt.Errorf("unknown image kind %q", kind)
	}
	prev, ok, err := r.getUserImage(id, kind)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}
	mimeCol := kind + "_mime"
	filenameCol := kind + "_filename"
	if _, err := r.db.Exec(
		fmt.Sprintf(`UPDATE users SET %s = NULL, %s = NULL WHERE id = ?`, mimeCol, filenameCol),
		id,
	); err != nil {
		return fmt.Errorf("clear %s meta: %w", kind, err)
	}
	_ = os.Remove(filepath.Join(userImageDir(id), prev.Filename))
	return nil
}

// UserImage describes the stored avatar or banner metadata for a user. ok is
// false when neither mime nor filename is set.
type UserImage struct {
	Mime     string
	Filename string
}

// getUserImage reads the *_mime + *_filename row for the requested kind.
func (r *UserRepository) getUserImage(id int64, kind string) (UserImage, bool, error) {
	mimeCol := kind + "_mime"
	filenameCol := kind + "_filename"
	var mime, filename sql.NullString
	err := r.db.QueryRow(
		fmt.Sprintf(`SELECT %s, %s FROM users WHERE id = ?`, mimeCol, filenameCol),
		id,
	).Scan(&mime, &filename)
	if err == sql.ErrNoRows {
		return UserImage{}, false, fmt.Errorf("user not found")
	}
	if err != nil {
		return UserImage{}, false, fmt.Errorf("read user %s: %w", kind, err)
	}
	if !mime.Valid || !filename.Valid || mime.String == "" || filename.String == "" {
		return UserImage{}, false, nil
	}
	return UserImage{Mime: mime.String, Filename: filename.String}, true, nil
}

// GetUserImageMeta is the exported read accessor for the avatar/banner meta.
// It's the same as the private getUserImage; exposed because the HTTP handler
// sits in a different package and needs the meta to stream the bytes back.
func (r *UserRepository) GetUserImageMeta(id int64, kind string) (UserImage, bool, error) {
	return r.getUserImage(id, kind)
}

// UserImageDiskPath returns the absolute on-disk path for a stored avatar or
// banner. Callers must only invoke it when getUserImage returned ok=true.
func UserImageDiskPath(id int64, img UserImage) string {
	return filepath.Join(userImageDir(id), img.Filename)
}

// userImageDir is the per-user image storage directory under the panel data
// dir. Kept private so callers go through the image helpers.
func userImageDir(id int64) string {
	return filepath.Join(config.DataDir(), "users", fmt.Sprintf("%d", id))
}

// imageExtensionForMime maps a MIME to a normalized on-disk extension. Kept
// in sync with extensionForMime in settings_repo.go (the logo allow-list).
// SVG is allowed for user images so users can pick crisp vector symbols.
func imageExtensionForMime(mime string) string {
	switch strings.ToLower(strings.TrimSpace(mime)) {
	case "image/png":
		return ".png"
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/gif":
		return ".gif"
	case "image/webp":
		return ".webp"
	case "image/svg+xml":
		return ".svg"
	default:
		return ""
	}
}

// IsEmailVerified reports whether the user has confirmed control of their
// email address. A DB created pre-migration-016 has the column defaulting
// to 0; we silently treat read errors as "verified=true" so a transient DB
// hiccup can't lock a confirmed user out of their account.
func (r *UserRepository) IsEmailVerified(id int64) bool {
	var v int
	err := r.db.QueryRow(`SELECT email_verified FROM users WHERE id = ?`, id).Scan(&v)
	if err != nil {
		return true
	}
	return v == 1
}

// MarkEmailVerified flips the email_verified flag on. Used by the verify
// handler once the submitted code clears.
func (r *UserRepository) MarkEmailVerified(id int64) error {
	_, err := r.db.Exec(`UPDATE users SET email_verified = 1 WHERE id = ?`, id)
	return err
}

// SuspensionRecord represents a single suspension entry in the history.
type SuspensionRecord struct {
	Timestamp string `json:"timestamp"`
	Reason    string `json:"reason"`
	Duration  string `json:"duration"` // "until_admin" or "auto:YYYY-MM-DD HH:MM:SS"
	AdminID   int64  `json:"admin_id"`
	AdminName string `json:"admin_name"`
}

// SuspendUser suspends a user with optional auto-unsuspend time.
// If suspendedUntil is nil, the suspension is indefinite (until admin unsuspends).
// Returns the new suspension count.
func (r *UserRepository) SuspendUser(id int64, suspendedUntil *time.Time, reason string, adminID int64, adminName string) (int, error) {
	// Get current user to read existing history
	user, err := r.GetByID(id)
	if err != nil {
		return 0, err
	}

	// Parse existing history
	var history []SuspensionRecord
	if user.SuspensionHistory != "" {
		_ = json.Unmarshal([]byte(user.SuspensionHistory), &history)
	}

	// Create new suspension record
	var durationStr string
	if suspendedUntil != nil {
		durationStr = "auto:" + suspendedUntil.Format("2006-01-02 15:04:05")
	} else {
		durationStr = "until_admin"
	}

	record := SuspensionRecord{
		Timestamp: time.Now().Format("2006-01-02 15:04:05"),
		Reason:    reason,
		Duration:  durationStr,
		AdminID:   adminID,
		AdminName: adminName,
	}
	history = append(history, record)

	// Marshal updated history
	historyJSON, err := json.Marshal(history)
	if err != nil {
		return 0, err
	}

	newCount := user.SuspensionCount + 1

	// Build the update query
	var query string
	var args []any
	if suspendedUntil != nil {
		query = `UPDATE users SET suspended = 1, suspended_until = ?, suspension_count = ?, suspension_history = ? WHERE id = ?`
		args = []any{suspendedUntil.Format("2006-01-02 15:04:05"), newCount, string(historyJSON), id}
	} else {
		query = `UPDATE users SET suspended = 1, suspended_until = NULL, suspension_count = ?, suspension_history = ? WHERE id = ?`
		args = []any{newCount, string(historyJSON), id}
	}

	_, err = r.db.Exec(query, args...)
	if err != nil {
		return 0, err
	}

	return newCount, nil
}

// UnsuspendUser unsuspends a user.
// Returns the current suspension count (unchanged).
func (r *UserRepository) UnsuspendUser(id int64) (int, error) {
	user, err := r.GetByID(id)
	if err != nil {
		return 0, err
	}

	_, err = r.db.Exec(`UPDATE users SET suspended = 0, suspended_until = NULL WHERE id = ?`, id)
	if err != nil {
		return 0, err
	}

	return user.SuspensionCount, nil
}

// IsUserSuspended checks if a user is currently suspended.
// Returns (isSuspended, suspensionEndTime, error)
func (r *UserRepository) IsUserSuspended(id int64) (bool, *time.Time, error) {
	var suspended int
	var suspendedUntil sql.NullString
	err := r.db.QueryRow(`SELECT suspended, suspended_until FROM users WHERE id = ?`, id).Scan(&suspended, &suspendedUntil)
	if err != nil {
		return false, nil, err
	}

	if suspended == 0 {
		return false, nil, nil
	}

	if suspendedUntil.Valid && suspendedUntil.String != "" {
		t, err := time.Parse("2006-01-02 15:04:05", suspendedUntil.String)
		if err != nil {
			return true, nil, nil
		}
		// Check if suspension has expired
		if time.Now().After(t) {
			// Auto-unsuspend
			_, _ = r.db.Exec(`UPDATE users SET suspended = 0, suspended_until = NULL WHERE id = ?`, id)
			return false, nil, nil
		}
		return true, &t, nil
	}

	// Suspended until admin unsuspends
	return true, nil, nil
}

// scanUserProfile scans a database row (row or rows) into a User struct,
// including the profile columns added by migration 018. The `dest` argument
// accepts either *sql.Row (GetByID/...) or sql.Rows (ListUsers) because both
// implement the Scan method we need. Using a tiny interface keeps the call
// sites uniform without pulling in a heavier abstraction.
func scanUserProfile(src interface{ Scan(dest ...any) error }, u *models.User, createdAt *sql.NullString) error {
	var id int64
	var username, email, pw sql.NullString
	var roleID sql.NullInt64
	var suspended sql.NullInt64
	var suspendedUntil sql.NullString
	var suspensionCount sql.NullInt64
	var suspensionHistory sql.NullString
	var displayName, bio, pronouns, accentColor, avatarSymbol sql.NullString
	var avatarMime, avatarFilename, bannerMime, bannerFilename sql.NullString
	var socialLinks sql.NullString
	if err := src.Scan(
		&id, &username, &email, &pw, &roleID, createdAt,
		&suspended, &suspendedUntil, &suspensionCount, &suspensionHistory,
		&displayName, &bio, &pronouns, &accentColor, &avatarSymbol,
		&avatarMime, &avatarFilename, &bannerMime, &bannerFilename, &socialLinks,
	); err != nil {
		return err
	}
	u.ID = id
	u.Username = username.String
	u.Email = email.String
	u.PasswordHash = pw.String
	u.RoleID = roleID.Int64
	if suspended.Valid {
		u.Suspended = int(suspended.Int64)
	}
	if suspendedUntil.Valid && suspendedUntil.String != "" {
		t, _ := time.Parse("2006-01-02 15:04:05", suspendedUntil.String)
		u.SuspendedUntil = &t
	}
	if suspensionCount.Valid {
		u.SuspensionCount = int(suspensionCount.Int64)
	}
	if suspensionHistory.Valid {
		u.SuspensionHistory = suspensionHistory.String
	}
	u.DisplayName = displayName.String
	u.Bio = bio.String
	u.Pronouns = pronouns.String
	u.AccentColor = accentColor.String
	u.AvatarSymbol = avatarSymbol.String
	if avatarMime.Valid && avatarFilename.Valid && avatarMime.String != "" && avatarFilename.String != "" {
		u.AvatarMime = avatarMime.String
		u.AvatarFilename = avatarFilename.String
		u.HasAvatar = true
	}
	if bannerMime.Valid && bannerFilename.Valid && bannerMime.String != "" && bannerFilename.String != "" {
		u.BannerMime = bannerMime.String
		u.BannerFilename = bannerFilename.String
		u.HasBanner = true
	}
	// Social links JSON can be empty/NULL on older rows; fall back to an
	// empty slice so downstream JSON and the SPA always see an array.
	if socialLinks.Valid && socialLinks.String != "" {
		_ = json.Unmarshal([]byte(socialLinks.String), &u.SocialLinks)
	}
	if u.SocialLinks == nil {
		u.SocialLinks = []models.SocialLink{}
	}
	return nil
}

// scanUserProfileRow is the *sql.Row variant of scanUserProfile, returning a
// freshly-allocated *User. It converts sql.ErrNoRows into a "user not found"
// error so callers can distinguish "no such user" from a transient DB error.
func scanUserProfileRow(row *sql.Row) (*models.User, error) {
	var u models.User
	var createdAtStr sql.NullString
	if err := scanUserProfile(row, &u, &createdAtStr); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("user not found")
		}
		return nil, err
	}
	if !createdAtStr.Valid {
		return nil, fmt.Errorf("user not found")
	}
	u.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAtStr.String)
	return &u, nil
}

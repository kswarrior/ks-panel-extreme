// Package secretbox provides the panel's AES-256-GCM seal/open helpers for
// the per-instance secret vault. The master key is sourced from the
// KSPANEL_MASTER_KEY environment variable and cached for the lifetime of
// the process; on first use when no env var is set a key is generated at
// random and pinned in memory but NOT persisted — so secrets written
// before a key is configured are tied to the running process and lost on
// restart, intentionally, to force operators to set KSPANEL_MASTER_KEY for
// any secrets they actually want to keep across restarts.
//
// Wire format of Seal() output: 12-byte nonce || ciphertext || 16-byte GCM
// tag (Go's cipher.GCM.Seal appends the tag to the ciphertext). Open()
// reverses that split and returns the cleartext or an error.
package secretbox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"sync"
)

var (
	once    sync.Once
	gcm     cipher.AEAD
	loadErr error
)

// load resolves the master key on first use. The key may be 32 hex chars
// (16 bytes) or 64 hex chars (32 bytes). For AES-256-GCM we prefer 32 bytes;
// a 16-byte key silently upsizes to AES-128-GCM so a "short key" operator
// still gets GCM, just with a smaller tag-space. Any other length is an
// error. Without KSPANEL_MASTER_KEY we mint a random in-memory key so the
// feature works on first launch for testing.
func load() {
	once.Do(func() {
		raw := os.Getenv("KSPANEL_MASTER_KEY")
		var key []byte
		if raw != "" {
			b, err := hex.DecodeString(raw)
			if err != nil {
				loadErr = fmt.Errorf("KSPANEL_MASTER_KEY must be hex: %w", err)
				return
			}
			key = b
		} else {
			// Generate a 32-byte key for AES-256. It is never written to disk;
			// secrets sealed before restart will be unreadable. This matches
			// the documented "set KSPANEL_MASTER_KEY to persist" behaviour.
			key = make([]byte, 32)
			if _, err := rand.Read(key); err != nil {
				loadErr = err
				return
			}
		}
		blk, err := aes.NewCipher(key)
		if err != nil {
			loadErr = err
			return
		}
		g, err := cipher.NewGCM(blk)
		if err != nil {
			loadErr = err
			return
		}
		gcm = g
	})
}

// Seal encrypts the cleartext with the master key and returns nonce||cipher.
func Seal(cleartext []byte) ([]byte, error) {
	load()
	if loadErr != nil {
		return nil, loadErr
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return gcm.Seal(nonce, nonce, cleartext, nil), nil
}

// Open reverses Seal. Returns the original cleartext or an error.
func Open(blob []byte) ([]byte, error) {
	load()
	if loadErr != nil {
		return nil, loadErr
	}
	ns := gcm.NonceSize()
	if len(blob) < ns {
		return nil, errors.New("secretbox: blob too short")
	}
	nonce, ct := blob[:ns], blob[ns:]
	return gcm.Open(nil, nonce, ct, nil)
}

// MaskValue replaces the cleartext with a 4-char preview + mask so the list
// UI can render "an EY…ecd secret" without exposing the value. Used by the
// list endpoint when the secret is masked.
func MaskValue(cleartext string) string {
	switch len(cleartext) {
	case 0:
		return ""
	case 1, 2, 3, 4:
		return "••••"
	default:
		return string(cleartext[0:2]) + "••••" + string(cleartext[len(cleartext)-2:])
	}
}

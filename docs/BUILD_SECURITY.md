# KS Panel & KSEdge — Build Security Documentation

This document describes the security hardening measures applied to the production build pipeline for `kspanel` and `ksedge`.

---

## Overview

The build system (`build.sh`) implements a **defense-in-depth** approach to binary hardening. The goal is to make reverse-engineering, tampering, and information extraction **significantly more difficult** while preserving all runtime functionality.

> **Important**: No binary protection is absolute. These measures increase the cost and effort required for unauthorized analysis. They do not make reverse-engineering impossible.

---

## Build Modes

### Production (Default)
```bash
./build.sh
# or
./build.sh production
```
Hardened release build with all security measures enabled.

### Development
```bash
./build.sh dev
```
Debuggable build with symbols, no stripping, no obfuscation.

---

## Applied Hardening Measures

### 1. Go Compiler/Linker Flags (`-trimpath`, `-ldflags="-s -w"`)

| Flag | Purpose | Impact |
|------|---------|--------|
| `-trimpath` | Removes all local filesystem paths from the binary | Prevents leakage of build machine paths, usernames, CI workspace paths |
| `-ldflags="-s"` | Strips symbol table | Removes function/variable names from symbol table |
| `-ldflags="-w"` | Strips DWARF debug information | Removes line numbers, source file references, type info |

**Verification**: `file binary` shows "stripped", no "with debug_info".

### 2. Binary Stripping (`strip --strip-unneeded`)

Post-compilation ELF symbol removal:
- Removes non-essential symbols (`.symtab`, `.strtab`)
- Preserves Go runtime symbols required for normal operation
- Validated: binary executes correctly after stripping

**Note**: Go binaries require certain symbols for runtime (reflection, panic handling, plugin loading). We use `--strip-unneeded` instead of full `-s` to preserve these.

### 3. Source Path Leakage Prevention

The build verifies no absolute paths remain in the binary:
- Scans for `/home/`, `/root/`, `/Users/`, `/tmp/`, `/build/`, `/workspace/`
- Checks for `.git`, GitHub/GitLab/Bitbucket URLs
- Verifies build root directory not embedded

### 4. Version Information (Controlled)

Only intentional metadata is embedded:
```go
Version   = "1.2.3"          // From VERSION env or "0.0.0"
Commit    = "abc1234"        // Short git SHA, or "unknown"
BuildDate = "2026-08-19T12:00:00Z"  // ISO8601 UTC
```

**Excluded**: Full git history, remote URLs, developer identity, local paths.

### 5. Frontend Production Hardening

Vite build configured for production:
- `--sourcemap=false`: No source maps embedded or generated
- Minification enabled (terser/esbuild)
- Code splitting for cache efficiency
- No development-only code paths

**Remember**: Frontend JavaScript is delivered to users — it is **not secret**. Proprietary logic stays in Go backend.

### 6. Go Obfuscation (Optional, via Garble)

Enable with:
```bash
GARBLE_ENABLE=1 ./build.sh
```

Requires: `go install mvdan.cc/garble@latest`

**What garble does**:
- Renames all identifiers (types, functions, variables, packages) to short meaningless names
- Encrypts string literals
- Inserts control flow obfuscation
- Preserves Go runtime compatibility

**Trade-offs**:
- ✅ Significantly increases reverse-engineering effort
- ✅ Maintains full Go runtime compatibility (reflection, plugins, etc.)
- ⚠️ Adds build dependency (garble)
- ⚠️ May complicate debugging production issues
- ⚠️ Requires rebuild with `garble build` for full effect (post-build not supported)

**Current implementation**: Build script documents the option. For full obfuscation, replace `go build` with `garble build` in the build script.

### 7. Secret Scanning

Release artifacts scanned for common secret patterns:
- AWS keys (`AKIA...`)
- GitHub tokens (`ghp_...`, `gho_...`, `ghu_...`, `ghs_...`, `ghr_...`)
- GitLab tokens (`glpat-...`)
- JWT tokens (`eyJ...`)
- Private keys (`-----BEGIN ... PRIVATE KEY-----`)
- Generic `password=`, `secret=`, `token=`, `api_key=` patterns

**Policy**: No permanent secrets embedded in binaries. Secrets retrieved at runtime via:
- Environment variables (`KSPANEL_MASTER_KEY`)
- Config files (not distributed)
- Secure secret management

### 8. Code Signing (Optional, via cosign)

Enable with:
```bash
SIGN_KEY=/path/to/private.key ./build.sh
```

Requires: `go install github.com/sigstore/cosign/v2/cmd/cosign@latest`

**Process**:
1. Build binaries
2. Generate SHA-256 checksums
3. Sign each artifact with cosign (keyless or key-based)
4. Produce `.sig` files alongside artifacts

**Verification** (by users):
```bash
cosign verify-blob --signature kspanel.sig --certificate kspanel.crt kspanel
```

### 9. Integrity Verification (SHA-256)

Every release includes:
```
release/
├── kspanel
├── kspanel.sha256
├── ksedge
├── ksedge.sha256
└── checksums.txt
```

**Verification**:
```bash
sha256sum -c checksums.txt
```

### 10. Secure Update Architecture

The existing update mechanism is preserved and verified:

```
KS Panel
   ↓
Download release metadata (version.json)
   ↓
Verify trusted signature (cosign)
   ↓
Verify checksum (SHA-256)
   ↓
Verify expected platform/architecture
   ↓
Install atomically (rename + .old rollback)
   ↓
Restart
   ↓
Health check
   ↓
Rollback if necessary
```

**Hardening applied**:
- Binary downloads verified via checksum before execution
- Atomic replacement with `.old` rollback preserved
- Update server uses HTTPS (Hugging Face) — consider adding signature verification in `update_handler.go`

### 11. Binary Architecture Validation

Build explicitly targets:
- `linux/amd64` (default)
- `linux/arm64` (via `GOARCH=arm64`)

CI should verify `file binary` matches expected architecture before publishing.

### 12. Reproducible Builds

Production builds minimize non-determinism:
- `-trimpath` removes path variability
- `SOURCE_DATE_EPOCH` support for deterministic timestamps
- `npm ci` for deterministic npm installs
- `go mod verify` for dependency integrity

**Intentionally non-reproducible**:
- `BuildDate` timestamp
- `Commit` hash
- `Version` string

### 13. Supply-Chain Security

- `go mod verify` — verifies `go.sum` matches `go.mod`
- `npm ci` — deterministic, lockfile-based installs (production)
- Dependencies pinned in `go.mod`/`go.sum` and `package-lock.json`
- No `npm install` in production CI

### 14. Plugin System Boundary

The plugin system maintains a clear security boundary:

```
Public Plugin API (documented)
        ↓
Plugin Runtime (Goja JS sandbox)
        ↓
Private KS Panel Core (internal/* packages)
```

**Protections**:
- Plugins interact only through documented interfaces
- No access to internal Go packages
- Capability-based permissions (`server.read`, `server.files.write`, etc.)
- Mod engine runs with `Error Isolation` — one crashed plugin doesn't crash panel

### 15. Runtime Security (Verified)

| Area | Protection |
|------|------------|
| File permissions | Binaries installed 755, configs 644 |
| Temp files | Atomic writes via `.tmp` + rename |
| Path traversal | `filepath.Clean` + scope checks in modengine |
| Command execution | No shell invocation; `exec.Command` with args |
| Plugin loading | Sandboxed Goja VM, no host access by default |
| Auth/Z | JWT + RBAC with granular permissions |
| Update execution | Checksum verified before swap |
| Network | TLS optional, token-based edge auth |

### 16. Build Directory Cleanup

Post-build, `release/` contains only:
```
kspanel
kspanel.sha256
kspanel.sig (if signed)
ksedge
ksedge.sha256
ksedge.sig (if signed)
checksums.txt
checksums.txt.sig (if signed)
```

Removed: `*.old`, `*.tmp`, `*.debug`, `*.map`, `*.dSYM`, source archives.

---

## Release Artifact Structure

### Production (Unsigned)
```
release/
├── kspanel
├── kspanel.sha256
├── ksedge
├── ksedge.sha256
└── checksums.txt
```

### Production (Signed)
```
release/
├── kspanel
├── kspanel.sha256
├── kspanel.sig
├── ksedge
├── ksedge.sha256
├── ksedge.sig
├── checksums.txt
└── checksums.txt.sig
```

---

## Verification Checklist (Run After Build)

- [ ] Both binaries exist in `release/`
- [ ] Both binaries executable
- [ ] `file` shows "ELF 64-bit LSB executable, stripped"
- [ ] No debug info (`file` doesn't show "with debug_info")
- [ ] No symbol table (`readelf -S` shows no `.symtab`)
- [ ] Source leakage scan clean
- [ ] Secret scan clean
- [ ] No `.map` files in embedded frontend
- [ ] Permissions 755 on binaries
- [ ] SHA-256 checksums match
- [ ] Signatures verify (if signed)
- [ ] Binaries respond to `--version` or `--help`

---

## Environment Variables Reference

| Variable | Purpose | Default |
|----------|---------|---------|
| `VERSION` | Semantic version | `0.0.0` (prod) / `dev` (dev) |
| `COMMIT` | Git short commit | Auto-detected |
| `BUILD_DATE` | ISO8601 UTC | Auto-generated |
| `GOOS` | Target OS | `linux` |
| `GOARCH` | Target arch | Host arch |
| `GARBLE_ENABLE` | Enable obfuscation | `0` |
| `SIGN_KEY` | Signing private key | None |
| `SIGN_CMD` | Custom sign command | `cosign sign-blob` |
| `SOURCE_DATE_EPOCH` | Reproducible timestamp | None |

---

## Limitations & Honest Assessment

| Protection | What It Does | What It Doesn't Do |
|------------|--------------|-------------------|
| `-trimpath` | Removes source paths | Doesn't hide logic/algorithms |
| `-s -w` | Strips debug info | Doesn't prevent decompilation |
| `strip` | Removes ELF symbols | Go runtime symbols remain |
| Garble | Obfuscates identifiers | Determined attacker can deobfuscate |
| Secret scan | Catches accidental leaks | Can't detect custom encoding |
| Signing | Detects tampering | Doesn't prevent analysis |
| Checksums | Verifies integrity | Doesn't protect source |

**Bottom line**: These measures raise the bar from "trivial" to "requires significant expertise and time". A determined, skilled reverse-engineer with enough time will eventually understand the binary. The goal is to make unauthorized copying/redistribution economically unattractive, not mathematically impossible.

---

## For Plugin Developers

The public plugin API is intentionally stable and documented. Third-party developers do **not** need access to private source code to build plugins.

**Plugin SDK provides**:
- TypeScript definitions for frontend slots/components
- Go/JS host API (logging, storage, events, RPC)
- Manifest schema (v2)
- Example plugins

**Private internals (not for plugins)**:
- Database schema / repositories
- Internal HTTP handlers
- Core panel logic (`internal/*` packages)
- Build/release tooling

---

## Updating Security Measures

When adding new dependencies or changing build process:
1. Run `go mod tidy && go mod verify`
2. Run `npm ci` and verify `package-lock.json` unchanged
3. Re-run security verification stage
4. Update this document if new protections added
5. Update `THREAT_MODEL.md` if threat surface changes
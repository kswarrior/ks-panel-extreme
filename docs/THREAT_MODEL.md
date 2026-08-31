# KS Panel & KSEdge — Threat Model

This document describes the threat model for KS Panel and KSEdge binaries, the protections in place, and the distinction between **protection**, **detection**, and **prevention**.

---

## Assets to Protect

| Asset | Description | Location |
|-------|-------------|----------|
| Proprietary Go backend logic | Core panel/edge algorithms, business logic | `kspanel`, `ksedge` binaries |
| Embedded frontend | React UI bundle (public) | `kspanel` binary (Go embed) |
| Plugin system architecture | Mod engine, sandbox, host API | `kspanel` binary |
| Update mechanism | Self-update, verification, rollback | `kspanel` binary, `update_handler.go` |
| Secret management | AES-256-GCM secret vault | `secretbox.go`, `KSPANEL_MASTER_KEY` env |
| Authentication/Authorization | JWT, RBAC, MFA, API keys | `auth/`, `permissions/` packages |
| Database schema/migrations | SQLite/PostgreSQL/MySQL schema | `db/`, migrations |
| Configuration | Panel config, edge config | Config files, env vars |

---

## Threat Actors

| Actor | Motivation | Capability |
|-------|------------|------------|
| **Casual inspector** | Curiosity, learning | `strings`, `file`, basic decompiler |
| **Competitor** | Copy features, bypass licensing | IDA Pro, Ghidra, Go decompilers, time |
| **Malicious user** | Extract secrets, bypass auth, RCE | Advanced RE, fuzzing, exploit dev |
| **Supply-chain attacker** | Inject malicious code in deps | Compromised npm/Go module, CI access |
| **Insider** | Leak source, plant backdoors | Source access, build system access |

---

## Attack Vectors & Mitigations

### 1. Casual Source Inspection
**Attack**: Run `strings`, `grep`, `file` on binary to extract paths, versions, secrets.

| Protection | Detection | Prevention |
|------------|-----------|------------|
| `-trimpath` removes source paths | Build scans for leakage | Paths never enter binary |
| `-ldflags=-s -w` strips debug info | `file` shows "stripped" | Debug info never emitted |
| `strip --strip-unneeded` | `readelf -S` shows no `.symtab` | Symbols removed post-link |
| Secret scan in build | CI fails on pattern match | Secrets never embedded |

**Residual Risk**: Low. Casual inspection yields minimal useful information.

---

### 2. Binary Extraction & Decompilation
**Attack**: Use Ghidra, IDA Pro, or Go-specific tools (go2idl, goreverse) to recover source-like representation.

| Protection | Detection | Prevention |
|------------|-----------|------------|
| Garble obfuscation (opt-in) | Build logs show garble | Identifiers renamed, strings encrypted |
| Stripped symbols | No function names in symbol table | Names not recoverable from binary |
| No source maps in frontend | Build verifies no `.map` files | Source maps never generated |

**Residual Risk**: **Medium-High**. Go binaries are inherently more analyzable than C/C++. Garble raises bar significantly but determined RE can:
- Recover control flow graphs
- Identify standard library calls
- Reconstruct logic from decompiled pseudo-code
- Use dynamic analysis (tracing, debugging)

**Honest Assessment**: Obfuscation increases cost 10-100x. It does not provide absolute protection.

---

### 3. Tampering (Binary Modification)
**Attack**: Modify binary to bypass checks, inject code, change behavior.

| Protection | Detection | Prevention |
|------------|-----------|------------|
| Code signing (cosign) | Signature verification fails | Unsigned modifications detected |
| SHA-256 checksums | Checksum mismatch | Integrity verified before execution |
| Update verification | Handler checks checksum | Modified updates rejected |
| Atomic update + rollback | Failed health check triggers rollback | Bad binary never becomes primary |

**Residual Risk**: Low for distributed binaries (signature/checksum verification). Medium if attacker has local root access (can replace binary + recalculate checksums).

---

### 4. Modified Update Packages
**Attack**: Compromise update server, serve malicious binary.

| Protection | Detection | Prevention |
|------------|-----------|------------|
| HTTPS (Hugging Face) | TLS cert validation | Transport encryption |
| Version manifest (version.json) | Panel fetches + compares | Version pinning |
| Checksum in manifest | `update_handler.go` verifies | Mismatch = abort |
| **Missing**: Signature verification | — | **Recommended**: Add cosign verify in `UpdateApplyHandler` |

**Residual Risk**: **Medium**. Current implementation trusts HTTPS + checksum. Adding artifact signing verification would provide defense-in-depth.

---

### 5. Credential Extraction
**Attack**: Extract API keys, database passwords, JWT secrets, master keys from binary.

| Protection | Detection | Prevention |
|------------|-----------|------------|
| No secrets in binary (policy) | Secret scan in CI | Secrets never compiled in |
| `KSPANEL_MASTER_KEY` from env | Runtime requires env var | Key not in binary |
| Edge tokens from panel at runtime | Token never in edge binary | Config generated per-node |
| Database creds from env/config | Not embedded | Externalized |

**Residual Risk**: Low **if policy followed**. Risk increases if developers accidentally embed secrets.

---

### 6. Plugin Abuse
**Attack**: Malicious plugin exploits panel internals, escapes sandbox, accesses host.

| Protection | Detection | Prevention |
|------------|-----------|------------|
| Goja sandbox (no host access by default) | Mod engine logs dangling hooks | No `os`, `net`, `exec` in sandbox |
| Capability-based permissions | Admin grants explicit caps | Plugins can't exceed granted caps |
| Error Isolation | Crashed plugin deactivated | One plugin can't crash panel |
| No internal package access | Go module boundaries | Plugins import only public SDK |

**Residual Risk**: Low for Goja sandbox. **Medium** if `-tags modengine_goja` enables full JS execution — sandbox escape bugs in Goja are possible (monitor Goja CVEs).

---

### 7. Supply-Chain Attacks
**Attack**: Compromised dependency injects malicious code.

| Protection | Detection | Prevention |
|------------|-----------|------------|
| `go mod verify` | CI fails on mismatch | `go.sum` locks versions |
| `npm ci` (prod) | Lockfile enforced | No floating versions |
| Pinned dependencies | `go.mod`, `package-lock.json` | No auto-upgrade |
| Minimal dependencies | Audit `go mod graph` | Reduce attack surface |

**Residual Risk**: Medium. Depends on upstream maintenance. Regular `govulncheck` and `npm audit` recommended.

---

### 8. Runtime Attacks

| Vector | Mitigation |
|--------|------------|
| Path traversal | `filepath.Clean` + scope checks in modengine `resolveScript` |
| Command injection | `exec.Command` with args (no shell), no user input in command |
| SQL injection | Parameterized queries via `database/sql` |
| XSS (frontend) | React auto-escapes, CSP headers in `security_headers.go` |
| CSRF | `csrf.go` middleware, SameSite cookies |
| Rate limiting | `ip_rate_limiter.go`, `persistent_rate_limiter.go` |
| Auth bypass | JWT validation, RBAC enforcement in `permissions/engine.go` |
| DoS | Body limits (`edgeBodyLimit`), timeouts, connection limits |

---

## Protection vs Detection vs Prevention

| Category | Definition | Examples in This Project |
|----------|------------|--------------------------|
| **Protection** | Makes attack harder or impossible | `-trimpath`, stripping, garble, sandbox, capability system |
| **Detection** | Identifies when attack occurs/attempted | Secret scan, checksum verification, signature verification, audit logs |
| **Prevention** | Stops attack before damage | Update checksum verification, atomic swap+rollback, input validation, rate limiting |

### Mapping

| Threat | Protection | Detection | Prevention |
|--------|------------|-----------|------------|
| Source inspection | ✅ Strip/trimpath | ✅ Build scan | — |
| Decompilation | ✅ Garble | — | — |
| Binary tampering | — | ✅ Signatures/checksums | ✅ Update verification |
| Malicious update | — | ✅ Checksum in manifest | ✅ Signature verify (TODO) |
| Credential theft | ✅ No secrets in binary | ✅ Secret scan | ✅ Env-based secrets |
| Plugin escape | ✅ Sandbox/caps | ✅ Dangling hook logs | ✅ Error isolation |
| Supply chain | ✅ Pinned deps | ✅ `go mod verify` | ✅ `npm ci` |
| Runtime exploits | ✅ Input validation | ✅ Audit logs | ✅ Rate limits/timeouts |

---

## Risk Assessment Summary

| Threat | Likelihood | Impact | Current Mitigation | Residual Risk |
|--------|------------|--------|-------------------|---------------|
| Casual inspection | High | Low | Strip, trimpath, secret scan | **Very Low** |
| Decompilation/RE | Medium | High | Garble (opt-in), stripping | **Medium** |
| Binary tampering | Low | High | Signatures, checksums | **Low** |
| Malicious update | Low | Critical | HTTPS, checksum | **Medium** (add sig verify) |
| Credential extraction | Low | Critical | No secrets in binary, env vars | **Very Low** |
| Plugin sandbox escape | Low | High | Goja sandbox, capabilities | **Low-Medium** |
| Supply chain | Low | High | Pinned deps, verify, audit | **Medium** |
| Runtime RCE | Low | Critical | Input validation, sandbox | **Low** |

---

## Recommended Improvements

### High Priority
1. **Add signature verification in `UpdateApplyHandler`** — verify cosign signature before installing update
2. **Enable garble by default in CI** — rebuild with `garble build` for production releases
3. **Add `govulncheck` to CI** — scan for known vulnerabilities in Go dependencies
4. **Add `npm audit` to CI** — scan for known vulnerabilities in npm dependencies

### Medium Priority
5. **SBOM generation** — `go install github.com/anchore/syft@latest` for software bill of materials
6. **Reproducible build verification** — build twice, compare hashes
7. **Runtime integrity monitoring** — optional self-hash check at startup

### Low Priority
8. **Control flow guard** — investigate Go 1.22+ CFG protection
9. **Anti-debugging** — **NOT RECOMMENDED** (breaks legitimate debugging, fragile)
10. **Hardware binding** — **NOT RECOMMENDED** (breaks legitimate deployments)

---

## What We Do NOT Do (Anti-Patterns)

| Anti-Pattern | Why We Avoid It |
|--------------|-----------------|
| Fake encryption of executable | Security through obscurity; key must be in binary |
| Password-protected binary with embedded password | Trivial to extract; false sense of security |
| Custom cryptography | Use established primitives (AES-GCM, Ed25519, SHA-256) |
| Hardcoded master keys | Compromise = total loss; use env vars |
| Obscure file names | Trivial to rename; no real protection |
| "Unbreakable" claims | Misleading; all binary protections are bypassable |
| Destructive anti-debugging | Can crash legitimate installations; hostile to users |

---

## Assumptions

1. **Attacker has binary** — they can download `kspanel`/`ksedge` from releases
2. **Attacker has time** — no time-bound assumptions
3. **Attacker has expertise** — assume skilled reverse-engineer
4. **Attacker does NOT have** — source code, signing keys, CI credentials, `KSPANEL_MASTER_KEY`
5. **Users verify artifacts** — operators check checksums/signatures before install
6. **HTTPS is trusted** — update server TLS not compromised
7. **Go runtime is trusted** — no Go compiler/stdlib backdoors

---

## Incident Response

If a binary is found to be compromised:
1. **Revoke signing key** (rotate cosign key)
2. **Publish new release** with incremented version
3. **Notify users** via update channel (version.json notes)
4. **Audit build pipeline** for compromise vector
5. **Rotate all secrets** (`KSPANEL_MASTER_KEY`, DB creds, API keys)
6. **Update threat model** with lessons learned

---

## Review Cadence

| Review | Frequency |
|--------|-----------|
| Threat model | Quarterly or major release |
| Dependency audit | Weekly (automated CI) |
| Secret scan | Every build (automated) |
| Penetration test | Annual or after major architecture change |
| Garble/obfuscation effectiveness | Per Go version upgrade |
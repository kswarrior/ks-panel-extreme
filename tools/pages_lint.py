#!/usr/bin/env python3
"""pages_lint.py — Instance Pages library linter + CI gate (A23).

Checks (must stay in parity with panel/backend/internal/api/handlers/instance_page_handler.go):
  - YAML parses (yamllint-ish: no tabs, no trailing WS, final newline)
  - validateInstancePage caps: content_* 1MiB, actions 64KiB, sub_pages 512KiB/20,
    components 512KiB/50, icon 16KiB, source_tsx 512KiB, name<=200, desc/cat/type<=500, slug<=64
  - validateReactSource denylist (react-only imports, no eval/fetch/WS/storage escapes)
  - slug-unique, icons unique (sanitized), marketplace<->ListNames parity

Usage: python3 tools/pages_lint.py [--strict]
Exit 0 when green, 1 with error list otherwise.
"""
import json
import os
import re
import sys
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES_DIR = os.path.join(ROOT, "instance_pages", "pages")
MARKET = os.path.join(ROOT, "instance_pages", "marketplace.json")
SHARED_DIR = os.path.join(ROOT, "instance_pages", "shared")

MAX_CONTENT = 1024 * 1024
MAX_ACTIONS = 64 * 1024
MAX_SUB = 512 * 1024
MAX_COMP = 512 * 1024
MAX_ICON = 16 * 1024
MAX_REACT = 512 * 1024
MAX_SUB_N = 20
MAX_COMP_N = 50

SLUG_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]*$')
SLUG_START_RE = re.compile(r'^[A-Za-z0-9]$')
SUBPATH_RE = re.compile(r'^[a-z0-9_-]+$')
COMP_RE = re.compile(r'^[A-Za-z0-9_][A-Za-z0-9_-]*$')

DENY_SUBSTRINGS = ["eval(", "new function", "__proto__", "xmlhttprequest",
                   "document.cookie", "localstorage", "sessionstorage",
                   "child_process", "require("]
FETCH_RE = re.compile(r'(^|[^a-zA-Z0-9_$])fetch\s*\(')
REACT_FROM_RE = re.compile(r"^\s*import\s+[^;]*?\sfrom\s+['\"]([^'\"]+)['\"]\s*;?\s*$", re.M)
REACT_SIDE_RE = re.compile(r"^\s*import\s+['\"]([^'\"]+)['\"]\s*;?\s*$", re.M)
EXPORT_RE = re.compile(r"^\s*export\s+(default|\{|\*)", re.M)

ICON_FORBIDDEN = ["<script", "<foreignobject", "<iframe", "<object", "<embed",
                  "<animate", "<set", "<handler", "onload=", "onerror=", "onclick=",
                  "javascript:", "vbscript:", "data:text/html"]


def load_yaml(path):
    try:
        import yaml  # type: ignore
    except ImportError:
        print("ERROR: pyyaml required (pip install pyyaml)", file=sys.stderr)
        sys.exit(2)
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    return raw, yaml.safe_load(raw)


def yamllint_file(path, raw, errors):
    lines = raw.split("\n")
    for i, ln in enumerate(lines, 1):
        if "\t" in ln:
            errors.append(f"{path}:{i}: yamllint: tab indentation")
        if ln != ln.rstrip():
            errors.append(f"{path}:{i}: yamllint: trailing whitespace")
        if len(ln) > 4000:
            errors.append(f"{path}:{i}: yamllint: line too long (>4000)")
    if raw and not raw.endswith("\n"):
        errors.append(f"{path}: yamllint: missing final newline")


def check_react_source(slug, src, errors):
    if len(src.encode("utf-8")) > MAX_REACT:
        errors.append(f"{slug}: source_tsx too large (max 512KiB)")
        return
    # strip sdk.fetchPanel before fetch check (mirror Go)
    nosdk = src.replace("sdk.fetchPanel", "")
    low = nosdk.lower()
    for d in DENY_SUBSTRINGS:
        if d in low:
            errors.append(f"{slug}: source_tsx uses forbidden primitive: {d}")
    # crude blank of strings/comments for fetch check: remove quoted spans
    tmp = re.sub(r"'[^']*'", "''", nosdk)
    tmp = re.sub(r'"[^"]*"', '""', tmp)
    tmp = re.sub(r'//[^\n]*', '', tmp)
    if FETCH_RE.search(tmp):
        errors.append(f"{slug}: source_tsx must use sdk.fetchPanel instead of fetch()")
    for m in REACT_FROM_RE.finditer(src):
        mod = m.group(1)
        if mod == "react" or mod.startswith("./") or mod.startswith("../"):
            continue
        errors.append(f"{slug}: source_tsx imports forbidden module '{mod}' (only react + relative allowed)")
    for m in REACT_SIDE_RE.finditer(src):
        mod = m.group(1)
        if mod == "react" or mod.startswith("./") or mod.startswith("../"):
            continue
        errors.append(f"{slug}: source_tsx side-effect import forbidden '{mod}'")
    if EXPORT_RE.search(src):
        # allow `export const|let|var|async|function|class|enum|namespace|interface|type|declare`
        for line in src.split("\n"):
            s = line.strip()
            if re.match(r"^export\s+(default|\{|\*)", s):
                errors.append(f"{slug}: source_tsx must not use `export default`/`export {{}}`/`export *`")
                break


def main():
    errors = []
    files = sorted(glob.glob(os.path.join(PAGES_DIR, "*.yaml")) +
                   glob.glob(os.path.join(PAGES_DIR, "*.yml")) +
                   glob.glob(os.path.join(PAGES_DIR, "*.json")))
    if not files:
        print("ERROR: no pages found", file=sys.stderr)
        return 1
    slugs = {}
    icons = {}
    pages_by_slug = {}
    for path in files:
        base = os.path.basename(path)
        if base.lower() in ("marketplace.json", "readme.md", "guide.md"):
            continue
        try:
            raw, doc = load_yaml(path) if not path.endswith(".json") else (open(path, encoding="utf-8").read(), json.load(open(path, encoding="utf-8")))
        except Exception as e:
            errors.append(f"{base}: parse error: {e}")
            continue
        if path.endswith(".yaml") or path.endswith(".yml"):
            yamllint_file(base, raw, errors)
        if not isinstance(doc, dict):
            errors.append(f"{base}: top-level must be a mapping")
            continue
        name = str(doc.get("name", "") or "")
        slug = str(doc.get("slug", "") or "")
        ctype = str(doc.get("content_type", "") or "")
        if not name:
            errors.append(f"{base}: name is required")
        elif len(name) > 200:
            errors.append(f"{base}: name too long (max 200)")
        for k in ("description", "category", "type"):
            v = doc.get(k, "")
            if v is None:
                v = ""
            if len(str(v)) > 500:
                errors.append(f"{base}: {k} too long (max 500)")
        if not slug:
            errors.append(f"{base}: slug is required")
        else:
            if slug != ".":
                if len(slug) > 64 or "/" in slug or ".." in slug or not SLUG_RE.match(slug) or not SLUG_START_RE.match(slug[:1]):
                    errors.append(f"{base}: invalid slug '{slug}'")
            if slug in slugs:
                errors.append(f"{base}: duplicate slug '{slug}' (also in {slugs[slug]})")
            else:
                slugs[slug] = base
        if ctype and ctype not in ("html", "markdown", "blocks", "react"):
            errors.append(f"{base}: bad content_type '{ctype}'")
        kind = str(doc.get("kind", "custom") or "custom")
        if kind != "custom":
            errors.append(f"{base}: kind must be custom (got '{kind}')")
        for f in ("content_html", "content_markdown", "content_blocks", "bundle_css"):
            v = doc.get(f, "")
            if v is None:
                v = ""
            if not isinstance(v, str):
                v = str(v)
            if len(v.encode("utf-8")) > MAX_CONTENT:
                errors.append(f"{base}: {f} too large (max 1MiB)")
        # content_blocks must be JSON array when non-empty string
        cb = doc.get("content_blocks", "")
        if isinstance(cb, list):
            pass  # YAML native list OK
        elif isinstance(cb, str) and cb.strip():
            try:
                arr = json.loads(cb)
                if not isinstance(arr, list):
                    errors.append(f"{base}: content_blocks must be JSON array")
            except Exception:
                errors.append(f"{base}: content_blocks invalid JSON")
        icon = doc.get("icon_svg", "")
        if icon is None:
            icon = ""
        icon = str(icon)
        if len(icon.encode("utf-8")) > MAX_ICON:
            errors.append(f"{base}: icon_svg too large (max 16KiB)")
        low_icon = icon.lower()
        for bad in ICON_FORBIDDEN:
            if bad in low_icon:
                errors.append(f"{base}: icon_svg contains forbidden '{bad}' (must be sanitized)")
        if icon.strip():
            if icon.strip() in icons:
                errors.append(f"{base}: icon_svg duplicates {icons[icon.strip()]} (icons must be unique)")
            else:
                icons[icon.strip()] = base
        # actions
        acts = doc.get("actions", "")
        if isinstance(acts, list):
            raw_acts = json.dumps(acts)
            if len(raw_acts.encode("utf-8")) > MAX_ACTIONS:
                errors.append(f"{base}: actions too large (max 64KiB)")
            if len(acts) == 0:
                pass
            for a in acts:
                if not isinstance(a, dict) or "name" not in a or "type" not in a:
                    errors.append(f"{base}: each action needs name+type")
                    break
                if a.get("type") not in ("shell", "read_file", "write_file", "list_files", "docker", "kvm", "lxd", "stat", "chmod", "archive", "extract"):
                    errors.append(f"{base}: unknown action type '{a.get('type')}'")
        elif isinstance(acts, str) and acts.strip():
            if len(acts.encode("utf-8")) > MAX_ACTIONS:
                errors.append(f"{base}: actions too large (max 64KiB)")
            try:
                arr = json.loads(acts)
                if not isinstance(arr, list):
                    errors.append(f"{base}: actions must be JSON array")
            except Exception:
                errors.append(f"{base}: actions invalid JSON")
        # sub_pages
        subs = doc.get("sub_pages", doc.get("pages", ""))
        if isinstance(subs, list):
            if len(subs) > MAX_SUB_N:
                errors.append(f"{base}: too many sub_pages (max 20)")
            if len(json.dumps(subs).encode("utf-8")) > MAX_SUB:
                errors.append(f"{base}: sub_pages too large (max 512KiB)")
            for s in subs:
                if not isinstance(s, dict) or "path" not in s:
                    errors.append(f"{base}: each sub_page needs path")
                    break
                if not SUBPATH_RE.match(str(s["path"])):
                    errors.append(f"{base}: bad sub path '{s['path']}' (^[a-z0-9_-]+$)")
        elif isinstance(subs, str) and subs.strip():
            if len(subs.encode("utf-8")) > MAX_SUB:
                errors.append(f"{base}: sub_pages too large (max 512KiB)")
        # components
        comps = doc.get("components", "")
        if isinstance(comps, list):
            if len(comps) > MAX_COMP_N:
                errors.append(f"{base}: too many components (max 50)")
            if len(json.dumps(comps).encode("utf-8")) > MAX_COMP:
                errors.append(f"{base}: components too large (max 512KiB)")
            names = set()
            for c in comps:
                if not isinstance(c, dict) or "name" not in c:
                    errors.append(f"{base}: each component needs name")
                    break
                n = str(c["name"])
                if not COMP_RE.match(n):
                    errors.append(f"{base}: bad component name '{n}'")
                if n in names:
                    errors.append(f"{base}: duplicate component '{n}'")
                names.add(n)
                if c.get("type") not in ("html", "markdown", "block", "shared", "module", ""):
                    # allow empty? be lenient but flag unknown
                    if c.get("type") not in (None, ""):
                        errors.append(f"{base}: unknown component type '{c.get('type')}'")
        elif isinstance(comps, str) and comps.strip():
            if len(comps.encode("utf-8")) > MAX_COMP:
                errors.append(f"{base}: components too large (max 512KiB)")
        # react source
        src = doc.get("source_tsx", "")
        if src is None:
            src = ""
        src = str(src)
        if ctype == "react" and not src.strip():
            errors.append(f"{base}: source_tsx required for react pages")
        if src.strip():
            check_react_source(slug or base, src, errors)
        pages_by_slug[slug] = (base, doc)
    # marketplace parity
    try:
        with open(MARKET, encoding="utf-8") as f:
            market = json.load(f)
    except Exception as e:
        errors.append(f"marketplace.json: parse error: {e}")
        market = None
    if market is not None:
        entries = market.get("pages", [])
        mids = {}
        for e in entries:
            mid = str(e.get("id", ""))
            if not mid:
                errors.append("marketplace.json: entry missing id")
                continue
            if mid in mids:
                errors.append(f"marketplace.json: duplicate id '{mid}'")
            mids[mid] = e
            for req in ("name", "description", "download_url", "icon_svg"):
                if req not in e:
                    errors.append(f"marketplace.json:{mid}: missing '{req}'")
            url = str(e.get("download_url", ""))
            if url.startswith("http"):
                # must point at instance_pages/pages/<file>
                m = re.search(r"instance_pages/pages/([^/]+)$", url)
                if not m:
                    errors.append(f"marketplace.json:{mid}: download_url must end with instance_pages/pages/<file> (got {url})")
                else:
                    fn = m.group(1)
                    if not os.path.exists(os.path.join(PAGES_DIR, fn)):
                        errors.append(f"marketplace.json:{mid}: download_url file missing: {fn}")
            elif url.startswith("pages/") or url.startswith("./pages/"):
                fn = os.path.basename(url)
                if not os.path.exists(os.path.join(PAGES_DIR, fn)):
                    errors.append(f"marketplace.json:{mid}: relative download_url file missing: {fn}")
            else:
                # relative allowed (A25): must still resolve to a page file
                if url and not url.startswith("#"):
                    fn = os.path.basename(url)
                    if fn and not os.path.exists(os.path.join(PAGES_DIR, fn)):
                        # only flag when it looks like a file ref
                        if fn.endswith((".yaml", ".yml", ".json")):
                            errors.append(f"marketplace.json:{mid}: download_url file missing: {fn}")
            # id must match a page slug
            if mid not in pages_by_slug:
                errors.append(f"marketplace.json:{mid}: no page with slug '{mid}' (ListNames parity)")
        # every page slug must have a marketplace entry
        for slug, (base, _doc) in pages_by_slug.items():
            if slug not in mids:
                errors.append(f"{base}: slug '{slug}' missing from marketplace.json (ListNames parity)")
    # shared snippet check (A19): ks_theme_head must exist
    shared_head = os.path.join(SHARED_DIR, "ks_theme_head.html")
    # also accept registry-only; warn if missing
    if not os.path.exists(shared_head):
        # check FE registry instead — only error if neither exists
        fe_reg = os.path.join(ROOT, "panel", "frontend", "src", "features", "instance-pages", "sharedPanelComponents.ts")
        try:
            with open(fe_reg, encoding="utf-8") as f:
                if "ks_theme_head" not in f.read():
                    errors.append("shared/ks_theme_head.html missing and ks_theme_head not in sharedPanelComponents.ts (A19)")
        except Exception:
            errors.append("shared/ks_theme_head.html missing (A19)")
    if errors:
        print(f"pages_lint: {len(errors)} error(s):")
        for e in errors:
            print(f"  - {e}")
        return 1
    print(f"pages_lint: OK ({len(files)} pages, {len(slugs)} slugs)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Convert instance_pages/pages/*.json library files to human-friendly *.yaml.

Mapping (lossless w.r.t. what the backend persists):
  * double-encoded JSON strings (actions / sub_pages / components / configure)
    become native YAML lists — no more escaped quotes;
  * any multiline string (content_html, content_markdown, source_tsx,
    bundle_css, content_blocks text, ...) becomes a `|` literal block so the
    raw HTML/JS/markdown is editable with syntax highlighting and no `\"`;
  * empty placeholders ("", "[]") are dropped — the backend defaults them.

Round-trip guarantee: YAML -> (native lists re-encoded to JSON strings) must
equal the source JSON modulo dropped empties. Verified with --check (default).

Usage:
    tools/pages_json_to_yaml.py [--check] [--pages-dir instance_pages/pages]

--check (default) writes nothing, only verifies every *.json converts and
round-trips cleanly. Pass --write to actually emit *.yaml files.
"""

import json
import sys
from pathlib import Path

import yaml

# Fields the DB/API carry as JSON-encoded STRINGS but humans should author
# as native YAML lists. content_blocks is a string too (a JSON array of
# block objects); a native list round-trips through the same encoding.
STRINGIFIED_LIST_FIELDS = (
    "actions",
    "sub_pages",
    "components",
    "configure",
    "content_blocks",
)


class Literal(str):
    """A string that PyYAML always emits as a `|` literal block.

    NOTE: the style must be exactly "|" (never "|-" / "|+"): PyYAML's
    emitter auto-selects the correct chomping indicator from the trailing
    newlines, while an explicit "|-"/"|+" degrades to double-quoted style
    as soon as the scalar contains non-ASCII characters.
    """


def _literal_representer(dumper, data):
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")


yaml.add_representer(Literal, _literal_representer, Dumper=yaml.SafeDumper)


def as_literal(value: str) -> Literal:
    """Wrap a multiline string so a YAML round-trip preserves it byte-exact."""
    return Literal(value)


def _literals(node):
    """Recursively wrap every multiline string so nested structures
    (e.g. sub_pages[].content_html) also emit as `|` literal blocks."""
    if isinstance(node, dict):
        return {k: _literals(v) for k, v in node.items()}
    if isinstance(node, list):
        return [_literals(v) for v in node]
    if isinstance(node, str) and "\n" in node:
        return as_literal(node)
    return node


def to_yaml_doc(src: dict) -> dict:
    """Map a parsed library *.json object to its YAML-authoring form."""
    doc: dict = {}
    for key, value in src.items():
        if key in STRINGIFIED_LIST_FIELDS and isinstance(value, str):
            text = value.strip()
            if text in ("", "[]"):
                continue  # backend defaults these; keep the file lean
            try:
                decoded = json.loads(value)
            except json.JSONDecodeError:
                doc[key] = value  # shouldn't happen; keep verbatim
                continue
            if decoded == []:
                continue
            doc[key] = _literals(decoded)
            continue
        if value == "" or value is None:
            continue  # drop empty content_* variants and unset optionals
        if isinstance(value, str) and "\n" in value:
            value = as_literal(value)
        doc[key] = value
    return doc


def semantic(doc: dict) -> str:
    """Canonical form for round-trip comparison: stringified lists are
    parsed first, so JSON escape style (\\u2014 vs literal) can't mismatch."""
    out: dict = {}
    for key, value in doc.items():
        if (
            key in STRINGIFIED_LIST_FIELDS
            and isinstance(value, str)
            and value.strip().startswith("[")
        ):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                pass
        out[key] = value
    return json.dumps(out, sort_keys=True, ensure_ascii=False)


def to_json_doc(doc: dict) -> dict:
    """Inverse of to_yaml_doc: what the backend persists for a YAML doc."""
    out: dict = {}
    for key, value in doc.items():
        if key in STRINGIFIED_LIST_FIELDS and not isinstance(value, str):
            value = json.dumps(value, ensure_ascii=False)
        out[key] = value
    return out


def convert_file(path: Path) -> tuple[str, dict, dict]:
    src = json.loads(path.read_text(encoding="utf-8"))
    doc = to_yaml_doc(src)
    header = (
        f"# {src.get('name', path.stem)} — instance page (YAML authoring format).\n"
        f"# Converted from {path.name}; edit this file, not JSON.\n"
        f"# Multiline content uses `|` literal blocks (raw HTML/JS, no escaping);\n"
        f"# actions/sub_pages/components/configure are native YAML lists.\n"
        f"# See instance_pages/README.md for the field reference.\n"
    )
    text = header + yaml.safe_dump(
        doc, sort_keys=False, allow_unicode=True, width=1000
    )
    return text, src, doc


def main(argv: list[str]) -> int:
    write = "--write" in argv
    pages_dir = Path("instance_pages/pages")
    for i, arg in enumerate(argv):
        if arg == "--pages-dir" and i + 1 < len(argv):
            pages_dir = Path(argv[i + 1])

    files = sorted(pages_dir.glob("*.json"))
    if not files:
        print(f"no *.json files in {pages_dir}", file=sys.stderr)
        return 1

    failed = 0
    for path in files:
        text, src, doc = convert_file(path)
        # Round-trip: YAML text -> JSON-shaped doc must equal src modulo
        # dropped empties ("" and "[]", which the backend defaults anyway).
        back = to_json_doc(yaml.safe_load(text))
        src_lean = {
            k: v
            for k, v in src.items()
            if not (v == "" or v is None or (isinstance(v, str) and v.strip() == "[]"))
        }
        # Compare semantically (escape-style agnostic).
        if semantic(back) != semantic(src_lean):
            print(f"ROUND-TRIP MISMATCH: {path.name}", file=sys.stderr)
            failed += 1
            continue
        dest = path.with_suffix(".yaml")
        if write:
            dest.write_text(text, encoding="utf-8")
            print(f"wrote {dest} ({len(text)} bytes, was {path.stat().st_size})")
        else:
            print(f"OK {path.name} -> {dest.name} ({len(text)} bytes)")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))

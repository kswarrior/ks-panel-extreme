// Sanitizer for author-supplied inline SVG icons (instance page `icon_svg`,
// custom instance icons). Icons are injected into the panel HOST origin via
// dangerouslySetInnerHTML, so every script-execution vector must be stripped
// before rendering. Rules mirror the backend sanitizeIconSVG in
// panel/backend/internal/api/handlers/instance_page_handler.go.

const MAX_ICON_LEN = 16 * 1024;

// Elements that can execute script or embed foreign documents. Stripped with
// their tags (inner text of e.g. <script> degrades to inert page text).
const DANGEROUS_ELEMENT =
  /<\s*\/?\s*(script|foreignObject|iframe|object|embed|animate|set|handler)\b[^>]*>?/gi;

// Inline event handlers: onload=, onerror=, onbegin= …
const EVENT_HANDLER = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

// Script-capable URL schemes in URL-bearing attributes.
const JS_URL =
  /(href|xlink:href|src|from|to|values|style)\s*=\s*("\s*(javascript|vbscript|data:text\/html)[^"]*"|\s*'(javascript|vbscript|data:text\/html)[^']*'|(?:javascript|vbscript|data:text\/html)[^\s>]*)/gi;

// External references (<use xlink:href="http://…">) may pull attacker SVG.
// Only same-document fragment refs (#id) are kept. Unquoted values (href=http://evil) also stripped.
const EXTERNAL_REF = /(xlink:href|href)\s*=\s*("[^"#][^"]*"|'[^#'][^']*'|[^"#\s>][^\s>]*)/gi;

// sanitizeSvgIcon strips script-execution vectors from an SVG icon string.
// Runs to a fixpoint so nested payloads ("<scr<script>ipt>") cannot survive.
// Returns '' for oversized input rather than a truncated (possibly dangerous)
// fragment.
export function sanitizeSvgIcon(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let prev = raw.trim();
  for (let i = 0; i < 10; i++) {
    let cur = prev.replace(DANGEROUS_ELEMENT, '');
    cur = cur.replace(EVENT_HANDLER, '');
    cur = cur.replace(JS_URL, '');
    cur = cur.replace(EXTERNAL_REF, '$1="#"');
    if (cur === prev) break;
    prev = cur;
  }
  return prev.length > MAX_ICON_LEN ? '' : prev;
}

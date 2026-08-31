import React, { useMemo } from 'react';

// DiscordBioMarkdown — renders the user's "About me" bio with a small subset
// of Discord-chat-flavoured markdown. The goal is to feel like a Discord
// message body, not a fully general CommonMark parser: we support the
// constructs users actually type in a short bio, and we deliberately reject
// raw HTML (everything is built as React nodes, so there's no injection
// surface — no dangerouslySetInnerHTML, no DOMPurify needed).
//
// Supported:
//   # / ## / ###            -> h1-h3
//   **bold** / __bold__     -> <strong>
//   *italic* / _italic_     -> <em>
//   ~~strike~~             -> <s>
//   `inline code`           -> <code>
//   ```fenced block```      -> <pre><code>
//   > single quote         -> <blockquote> (one paragraph)
//   >>> multi-line quote    -> <blockquote> (raw text, kept verbatim)
//   - / * bullets           -> <ul>
//   1. ordered              -> <ol>
//   ||spoiler||             -> reveal-on-click <span>
//   [text](url)             -> <a target=_blank rel=noreferrer noopener>
//   bare http(s)://…         -> auto-linked <a>
//
// GitHub-style code fences and Discord's whitespace masking are intentionally
// close to the real client so muscle memory carries over.

const fieldClass =
  'w-full bg-black/30 backdrop-blur-md text-white placeholder-gray-500 ' +
  'border border-white/10 rounded-md px-3 py-2 text-sm';

// A clickable spoiler. Clicking toggles visibility; aria keeps it usable for
// keyboard / screen-reader users. We keep the local state in the component so
// each spoiler instance is independent.
const Spoiler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [revealed, setRevealed] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => setRevealed((r) => !r)}
      aria-pressed={revealed}
      className={
        'inline rounded px-1 mx-0.5 align-baseline transition-colors ' +
        (revealed
          ? 'bg-black/30 text-white'
          : 'bg-gray-500/40 text-transparent hover:text-gray-200 selection:bg-gray-500/40')
      }
    >
      {children}
    </button>
  );
};

// renderInline parses a single line of text into bold/italic/strike/code/spoiler
// spans. It's a tiny recursive-descent over regex alternation; we run markers
// left-to-right, preferring the earliest match. Inline code runs are scanned
// first so their contents are *not* re-parsed (Discord doesn't bold inside
// backticks).
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const rest = text.slice(i);

    // inline code `…`  (single backtick; Discord also supports double, but
    // single is far more common in bios).
    const code = rest.match(/^`([^`]+)`/);
    if (code) {
      out.push(
        <code
          key={`${keyBase}-c${key++}`}
          className="px-1 py-0.5 rounded bg-black/50 border border-white/10 text-[0.85em] font-mono"
        >
          {code[1]}
        </code>
      );
      i += code[0].length;
      continue;
    }

    // spoiler ||…||
    const sp = rest.match(/^\|\|([^|]+)\|\|/);
    if (sp) {
      out.push(
        <Spoiler key={`${keyBase}-s${key++}`}>{sp[1]}</Spoiler>
      );
      i += sp[0].length;
      continue;
    }

    // bold **…** or __…__
    const bold = rest.match(/^(?:\*\*([^*]+)\*\*|__([^_]+)__)/);
    if (bold) {
      out.push(
        <strong key={`${keyBase}-b${key++}`} className="font-semibold">
          {bold[1] ?? bold[2]}
        </strong>
      );
      i += bold[0].length;
      continue;
    }

    // italic *…* or _…_  (kept after bold so ** isn't matched as two italics)
    const ital = rest.match(/^(?:\*([^*]+)\*|_([^_]+)_)/);
    if (ital) {
      out.push(
        <em key={`${keyBase}-i${key++}`}>{ital[1] ?? ital[2]}</em>
      );
      i += ital[0].length;
      continue;
    }

    // strikethrough ~~…~~
    const strike = rest.match(/^~~([^~]+)~~/);
    if (strike) {
      out.push(
        <s key={`${keyBase}-k${key++}`} className="line-through opacity-80">
          {strike[1]}
        </s>
      );
      i += strike[0].length;
      continue;
    }

    // link [text](url) — Discord only auto-links absolute http(s) URLs, but
    // the standard markdown form is friendlier in a bio. We require http(s)
    // so javascript: can't sneak in.
    const md = rest.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/);
    if (md) {
      out.push(
        <a
          key={`${keyBase}-l${key++}`}
          href={md[2]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-blue-300 hover:underline"
        >
          {md[1]}
        </a>
      );
      i += md[0].length;
      continue;
    }

    // bare URL
    const bare = rest.match(/^https?:\/\/[^\s)]+/);
    if (bare) {
      out.push(
        <a
          key={`${keyBase}-u${key++}`}
          href={bare[0]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-blue-300 hover:underline"
        >
          {bare[0]}
        </a>
      );
      i += bare[0].length;
      continue;
    }

    // Otherwise consume one char and accumulate into a text run so we don't
    // emit one <span> per character. We scan forward until the next marker
    // start (`* _ ~ \` | [ h`) and flush the chunk as a single text node.
    let next = rest.length;
    for (const m of ['*', '_', '~', '`', '|', '[', 'h']) {
      const idx = rest.indexOf(m, 1);
      if (idx !== -1 && idx < next) next = idx;
    }
    // Also stop at a newline so the outer block splitter keeps line structure.
    const nl = rest.indexOf('\n', 1);
    if (nl !== -1 && nl < next) next = nl;
    const chunk = rest.slice(0, next);
    out.push(<React.Fragment key={`${keyBase}-t${key++}`}>{chunk}</React.Fragment>);
    i += chunk.length;
  }
  return out;
}

// A "list" run detector: returns the type and indent level for a single line.
function detectList(line: string): 'ul' | 'ol' | null {
  if (/^\s*[-*]\s+/.test(line)) return 'ul';
  if (/^\s*\d+\.\s+/.test(line)) return 'ol';
  return null;
}

// MarkdownBio is the exported renderer. It accepts the raw bio string and a
// className for the wrapping element (so callers can match the surrounding
// textarea's sizing).
export const MarkdownBio: React.FC<{ source: string; className?: string }> = ({
  source,
  className,
}) => {
  const nodes = useMemo(() => render(source), [source]);
  return <div className={className}>{nodes}</div>;
};

// render walks the source line-by-line grouping fenced code blocks, blockquotes
// (>, >>>), headings, lists, and paragraphs. Each group becomes one React
// node so React keys stay stable per render.
function render(source: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block ```lang\n...\n```  (tilde fences also accepted).
    const fence = line.match(/^\s*(```|~~~)(.*)$/);
    if (fence) {
      const marker = fence[1];
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].includes(marker)) {
        buf.push(lines[i]);
        i++;
      }
      // skip closing fence line
      if (i < lines.length) i++;
      out.push(
        <pre
          key={`pre${key++}`}
          className="my-1 p-2 rounded bg-black/60 border border-white/10 overflow-x-auto text-[0.85em] font-mono"
        >
          <code>{buf.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Multi-line blockquote >>>  (everything until EOF or blank line is raw).
    if (/^\s*>>>\s*$/.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '') {
        buf.push(lines[i]);
        i++;
      }
      out.push(
        <blockquote
          key={`bqm${key++}`}
          className="my-1 pl-3 border-l-4 border-white/20 text-gray-200 italic whitespace-pre-wrap"
        >
          {buf.join('\n')}
        </blockquote>
      );
      continue;
    }

    // Consecutive single-line > quotes collapse into one blockquote.
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      out.push(
        <blockquote
          key={`bq${key++}`}
          className="my-1 pl-3 border-l-4 border-white/20 text-gray-200"
        >
          {renderInline(buf.join('\n'), `bq${key}`)}
        </blockquote>
      );
      continue;
    }

    // Headings # / ## / ### (Discord also supports #### but bios rarely need it).
    const h = line.match(/^\s*(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const content = h[2];
      const Tag = (`h${level}` as 'h1' | 'h2' | 'h3');
      const size = level === 1 ? 'text-lg' : level === 2 ? 'text-base' : 'text-sm';
      out.push(
        <Tag key={`h${key++}`} className={`font-semibold mt-1 ${size}`}>
          {renderInline(content, `h${level}${key}`)}
        </Tag>
      );
      i++;
      continue;
    }

    // Lists: gather consecutive ul/ol lines into one list element. We keep it
    // single-level (Discord renders nested lists, but bios rarely nest).
    const lt = detectList(line);
    if (lt) {
      const items: React.ReactNode[] = [];
      while (i < lines.length) {
        const m = lines[i].match(lt === 'ul' ? /^\s*[-*]\s+(.*)$/ : /^\s*(\d+)\.\s+(.*)$/);
        if (!m) break;
        const text = lt === 'ul' ? m[1] : m[2];
        items.push(
          <li key={`li${key++}`}>{renderInline(text, `li${key}`)}</li>
        );
        i++;
      }
      if (lt === 'ul') {
        out.push(
          <ul key={`ul${key++}`} className="my-1 pl-5 list-disc space-y-0.5">
            {items}
          </ul>
        );
      } else {
        out.push(
          <ol key={`ol${key++}`} className="my-1 pl-5 list-decimal space-y-0.5">
            {items}
          </ol>
        );
      }
      continue;
    }

    // Blank line -> a small gap (Discord collapses blank lines but a breath
    // of space reads better in a bio box).
    if (line.trim() === '') {
      out.push(<div key={`sp${key++}`} className="h-2" />);
      i++;
      continue;
    }

    // Default: a paragraph. We gather contiguous non-special lines so a
    // soft-wrapped paragraph stays one <p>. Discord renders single newlines
    // as line breaks; we mirror that with whitespace-pre-wrap + \n.
    const buf: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (
        l.trim() === '' ||
        /^\s*(```|~~~)/.test(l) ||
        /^\s*>>>\s*$/.test(l) ||
        /^\s*>\s?/.test(l) ||
        /^\s*#{1,3}\s+/.test(l) ||
        detectList(l)
      ) {
        break;
      }
      buf.push(l);
      i++;
    }
    out.push(
      <p
        key={`p${key++}`}
        className="my-0.5 whitespace-pre-wrap break-words leading-snug"
      >
        {renderInline(buf.join('\n'), `p${key}`)}
      </p>
    );
  }

  return out;
}

// BioMarkdownEditor renders a textarea + a Raw/Preview toggle. It owns the
// raw value, maxLength and placeholder, and forwards onChange. When the user
// picks Preview it swaps the textarea for MarkdownBio so they can see exactly
// how the bio will look. Kept self-contained (no external lib) so it can be
// dropped straight into Account.tsx in place of the existing textarea.
export const BioMarkdownEditor: React.FC<{
  value: string;
  onChange: (next: string) => void;
  maxLength: number;
  placeholder: string;
  areaClassName: string;
  label: string;
}> = ({ value, onChange, maxLength, placeholder, areaClassName, label }) => {
  const [mode, setMode] = React.useState<'raw' | 'preview'>('raw');

  return (
    <>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-sm font-medium text-gray-300">{label}</label>
        <div className="inline-flex rounded-md border border-white/10 overflow-hidden text-xs">
          {(['raw', 'preview'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                'ks-tab capitalize ' + (mode === m ? 'ks-tab-active' : '')
              }
              aria-pressed={mode === m}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {mode === 'raw' ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          rows={6}
          className={areaClassName + ' resize-y'}
          placeholder={placeholder}
        />
      ) : (
        <div className={areaClassName + ' min-h-[8rem]'}>
          {value.trim() === '' ? (
            <p className="text-gray-500 italic text-sm">
              {placeholder}
            </p>
          ) : (
            <MarkdownBio source={value} className="text-sm text-white" />
          )}
        </div>
      )}
      <p className="mt-1 text-right text-xs text-gray-500">
        {value.length}/{maxLength}
      </p>
      <p className="mt-0.5 text-xs text-gray-500">
        Markdown: <code className="text-gray-400"># H</code>,{' '}
        <code className="text-gray-400">**bold**</code>,{' '}
        <code className="text-gray-400">*italic*</code>,{' '}
        <code className="text-gray-400">~~strike~~</code>,{' '}
        <code className="text-gray-400">`code`</code>,{' '}
        <code className="text-gray-400">{'>'} quote</code>,{' '}
        <code className="text-gray-400">{'>>>'} long quote</code>,{' '}
        <code className="text-gray-400">- list</code>,{' '}
        <code className="text-gray-400">||spoiler||</code>,{' '}
        <code className="text-gray-400">[text](url)</code>.
      </p>
    </>
  );
};

// Re-export a stable fieldClass for callers that want to mirror the editor's
// visual weight outside this component (kept thin on purpose).
export const bioEditorFieldClass = fieldClass + ' w-full';

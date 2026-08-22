// Files syntax highlighter utilities - extracted from Files.tsx

import type { HLMode, HLRule, HLToken, FileEntry, FileType } from '../types/files';
import { IMAGE_EXTS, VIDEO_EXTS, AUDIO_EXTS, ARCHIVE_EXTS, PDF_EXTS, DOC_EXTS, SHEET_EXTS, JSON_EXTS, CONFIG_EXTS, MARKUP_EXTS, CODE_EXTS, SCRIPT_EXTS, BINARY_EXTS } from '../types/files';

export const CL = {
  keyword: 'hl-kw',
  string: 'hl-str',
  number: 'hl-num',
  comment: 'hl-com',
  punct: 'hl-punc',
  bool: 'hl-bool',
  tag: 'hl-tag',
  attr: 'hl-attr',
  prop: 'hl-prop',
  op: 'hl-op',
  fn: 'hl-fn',
  heading: 'hl-h',
  link: 'hl-link',
  def: 'hl-def',
};

export const HL_RULES: Record<HLMode, HLRule[]> = {
  plain: [],
  js: [
    { re: /\/\/[^\n]*/, cls: CL.comment },
    { re: /\/\*[\s\S]*?\*\//, cls: CL.comment },
    { re: /`(?:\\.|[^`\\])*`/, cls: CL.string },
    { re: /"(?:\\.|[^"\\])*"/, cls: CL.string },
    { re: /'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /\b(true|false|null|undefined|NaN|Infinity)\b/, cls: CL.bool },
    { re: /\b(abstract|arguments|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|var|void|while|with|yield)\b/, cls: CL.keyword },
    { re: /\b[A-Z][A-Za-z0-9_]*\b/, cls: CL.def },
    { re: /[A-Za-z_$][\w$]*(?=\s*\()/, cls: CL.fn },
    { re: /0[xX][0-9a-fA-F]+|\d+\.?\d*([eE][+-]?\d+)?/, cls: CL.number },
    { re: /[{}()\[\];,.]/, cls: CL.punct },
    { re: /[-+*/%=<>!&|^~?:]+/, cls: CL.op },
  ],
  ts: [
    { re: /\/\/[^\n]*/, cls: CL.comment },
    { re: /\/\*[\s\S]*?\*\//, cls: CL.comment },
    { re: /`(?:\\.|[^`\\])*`/, cls: CL.string },
    { re: /"(?:\\.|[^"\\])*"/, cls: CL.string },
    { re: /'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /\b(true|false|null|undefined|NaN|Infinity)\b/, cls: CL.bool },
    { re: /\b(abstract|any|as|async|await|break|case|catch|class|const|continue|declare|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|infer|instanceof|interface|is|keyof|let|namespace|never|new|of|private|protected|public|readonly|return|satisfies|set|static|super|switch|this|throw|try|type|typeof|undefined|unknown|var|void|while|with|yield)\b/, cls: CL.keyword },
    { re: /\b(string|number|boolean|object|symbol|bigint)\b/, cls: CL.keyword },
    { re: /\b[A-Z][A-Za-z0-9_]*\b/, cls: CL.def },
    { re: /[A-Za-z_$][\w$]*(?=\s*[<(])/, cls: CL.fn },
    { re: /0[xX][0-9a-fA-F]+|\d+\.?\d*([eE][+-]?\d+)?/, cls: CL.number },
    { re: /[{}()\[\];,.]/, cls: CL.punct },
    { re: /[-+*/%=<>!&|^~?:]+/, cls: CL.op },
  ],
  json: [
    { re: /"(?:\\.|[^"\\])*"(?=\s*:)/, cls: CL.attr },
    { re: /"(?:\\.|[^"\\])*"/, cls: CL.string },
    { re: /\b(true|false|null)\b/, cls: CL.bool },
    { re: /-?\d+\.?\d*([eE][+-]?\d+)?/, cls: CL.number },
    { re: /[{}[\]:,]/, cls: CL.punct },
  ],
  yaml: [
    { re: /#[^\n]*/, cls: CL.comment },
    { re: /^[\t ]*-[^\n]*/, cls: CL.keyword },
    { re: /\b[\w.-]+(?=:)/, cls: CL.attr },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /\b(true|false|null|yes|no|on|off)\b/, cls: CL.bool },
    { re: /-?\d+\.?\d*([eE][+-]?\d+)?/, cls: CL.number },
    { re: /[:{}\[\],|-]/, cls: CL.punct },
  ],
  toml: [
    { re: /#[^\n]*/, cls: CL.comment },
    { re: /^\[[\w.\-]+\]/, cls: CL.def },
    { re: /\b[\w_-]+(?=\s*=)/, cls: CL.attr },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /\b(true|false)\b/, cls: CL.bool },
    { re: /-?\d+\.?\d*([eE][+-]?\d+)?/, cls: CL.number },
    { re: /[=\[\].,]/, cls: CL.punct },
  ],
  ini: [
    { re: /[;#][^\n]*/, cls: CL.comment },
    { re: /^\[[\w.\-]+\]/, cls: CL.def },
    { re: /\b[\w_-]+(?=\s*=)/, cls: CL.attr },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /-?\d+\.?\d*/, cls: CL.number },
    { re: /[=:]/, cls: CL.punct },
  ],
  env: [
    { re: /#[^\n]*/, cls: CL.comment },
    { re: /^[A-Z][A-Z0-9_]*(?==)/, cls: CL.attr },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /\b(true|false)\b/i, cls: CL.bool },
    { re: /-?\d+\.?\d*/, cls: CL.number },
    { re: /[=:]/, cls: CL.punct },
  ],
  sh: [
    { re: /#[^\n]*/, cls: CL.comment },
    { re: /"(?:\\.|[^"\\])*"/, cls: CL.string },
    { re: /'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|in|function|return|local|export|unset|set|echo|printf|read|cd|exit|alias)\b/, cls: CL.keyword },
    { re: /\$\{?[A-Za-z_][\w]*\}?/, cls: CL.attr },
    { re: /^[A-Za-z_][\w]*(?=\(\))/, cls: CL.fn },
    { re: /[|&;()<>\n]/, cls: CL.punct },
  ],
  markup: [
    { re: /<!--[\s\S]*?-->/, cls: CL.comment },
    { re: /<\/?[A-Za-z][\w.-]*/, cls: CL.tag },
    { re: /\/?>/, cls: CL.tag },
    { re: /[A-Za-z_:][\w:.-]*(?=\s*=)/, cls: CL.attr },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/, cls: CL.string },
  ],
  md: [
    { re: /^#{1,6}\s.*$/, cls: CL.heading },
    { re: /^>\s.*$/, cls: CL.comment },
    { re: /^[-*+]\s/, cls: CL.op },
    { re: /`[^`\n]*`/, cls: CL.string },
    { re: /\*\*[^*\n]+\*\*|__[^_\n]+__/, cls: CL.def },
    { re: /\[[^\]]+\]\([^)]+\)/, cls: CL.link },
  ],
  css: [
    { re: /\/\*[\s\S]*?\*\//, cls: CL.comment },
    { re: /[.#]?[A-Za-z_-][\w-]*(?=\s*\{)/, cls: CL.tag },
    { re: /[A-Za-z-]+(?=\s*:)/, cls: CL.attr },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /#[0-9a-fA-F]{3,8}|\b\d+(\.\d+)?(px|em|rem|%|vh|vw|s|ms|deg|fr)?\b/, cls: CL.string },
    { re: /[{}();:,]/, cls: CL.punct },
  ],
  go: [
    { re: /\/\/[^\n]*/, cls: CL.comment },
    { re: /\/\*[\s\S]*?\*\//, cls: CL.comment },
    { re: /`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /\b(break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var)\b/, cls: CL.keyword },
    { re: /\b(bool|byte|complex64|complex128|error|float32|float64|int|int8|int16|int32|int64|rune|string|uint|uint8|uint16|uint32|uint64|uintptr)\b/, cls: CL.def },
    { re: /\b(true|false|nil)\b/, cls: CL.bool },
    { re: /[A-Za-z_][\w]*(?=\s*\()/, cls: CL.fn },
    { re: /0[xX][0-9a-fA-F]+|\d+\.?\d*([eE][+-]?\d+)?/, cls: CL.number },
    { re: /[{}()\[\];,.]/, cls: CL.punct },
    { re: /[-+*/%=<>!&|^~:=]+/, cls: CL.op },
  ],
  py: [
    { re: /#[^\n]*/, cls: CL.comment },
    { re: /"""[\s\S]*?"""|'''[\s\S]*?'''/, cls: CL.comment },
    { re: /f"(?:\\.|[^"\\])*"|f'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /\b(False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b/, cls: CL.keyword },
    { re: /\b(self|cls|int|float|str|list|tuple|dict|set|bool|bytes)\b/, cls: CL.def },
    { re: /[A-Za-z_][\w]*(?=\s*\()/, cls: CL.fn },
    { re: /\b0[xX][0-9a-fA-F]+|\b\d+\.?\d*([eE][+-]?\d+)?\b/, cls: CL.number },
    { re: /[{}()\[\];,.]/, cls: CL.punct },
    { re: /[-+*/%=<>!&|^~@]+/, cls: CL.op },
  ],
  sql: [
    { re: /--[^\n]*/, cls: CL.comment },
    { re: /\/\*[\s\S]*?\*\//, cls: CL.comment },
    { re: /'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /"(?:\\.|[^"\\])*"/, cls: CL.string },
    { re: /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|INTO|VALUES|SET|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|HAVING|LIMIT|OFFSET|CREATE|TABLE|PRIMARY|KEY|FOREIGN|REFERENCES|NOT|NULL|DEFAULT|UNIQUE|INDEX|AND|OR|NOT|IN|LIKE|BETWEEN|DISTINCT|AS|CASE|WHEN|THEN|ELSE|END)\b/i, cls: CL.keyword },
    { re: /\b(INTEGER|TEXT|REAL|BLOB|VARCHAR|INT|SERIAL|TIMESTAMP|DATE|BOOLEAN|NUMERIC)\b/i, cls: CL.def },
    { re: /\b\d+\.?\d*([eE][+-]?\d+)?\b/, cls: CL.number },
    { re: /[{}()[\];,]/, cls: CL.punct },
  ],
  csv: [
    { re: /"(?:\\.|[^"\\])*"/, cls: CL.string },
    { re: /,/, cls: CL.punct },
  ],
  c: [
    { re: /\/\/[^\n]*/, cls: CL.comment },
    { re: /\/\*[\s\S]*?\*\//, cls: CL.comment },
    { re: /"(?:\\.|[^"\\])*"/, cls: CL.string },
    { re: /'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /\b(auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|inline|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|_Bool|_Complex)\b/, cls: CL.keyword },
    { re: /\b(true|false|NULL)\b/, cls: CL.bool },
    { re: /\b[A-Za-z_][\w]*(?=\s*\()/, cls: CL.fn },
    { re: /\b0[xX][0-9a-fA-F]+|\d+\.?\d*([eE][+-]?\d+)?[fFlLuU]?\b/, cls: CL.number },
    { re: /[{}()\[\];,.]/, cls: CL.punct },
    { re: /[-+*/%=<>!&|^~?:]+/, cls: CL.op },
  ],
  rb: [
    { re: /#[^\n]*/, cls: CL.comment },
    { re: /=begin[\s\S]*?=end/, cls: CL.comment },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /\b(BEGIN|END|alias|and|begin|break|case|class|def|defined|do|else|elsif|end|ensure|false|for|if|in|module|next|nil|not|or|redo|rescue|retry|return|self|super|then|true|undef|unless|until|when|while|yield)\b/, cls: CL.keyword },
    { re: /:[A-Za-z_][\w]*/, cls: CL.attr },
    { re: /@[A-Za-z_][\w]*|\$[A-Za-z_][\w]*/, cls: CL.attr },
    { re: /[A-Za-z_][\w]*(?=[!?=]?[!?=]?\()/, cls: CL.fn },
    { re: /\b\d+\.?\d*([eE][+-]?\d+)?\b/, cls: CL.number },
    { re: /[{}()\[\];,.]/, cls: CL.punct },
    { re: /[-+*/%=<>!&|^~]+/, cls: CL.op },
  ],
  php: [
    { re: /\/\/[^\n]*|#\[^\n]*|\/\*[\s\S]*?\*\//, cls: CL.comment },
    { re: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/, cls: CL.string },
    { re: /\b(abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|die|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|enum|eval|exit|extends|final|finally|fn|for|foreach|function|global|goto|if|implements|include|include_once|instanceof|insteadof|interface|isset|list|match|namespace|new|or|print|private|protected|public|readonly|require|require_once|return|static|switch|throw|trait|try|unset|use|var|while|xor|yield)\b/, cls: CL.keyword },
    { re: /\b(true|false|null)\b/i, cls: CL.bool },
    { re: /\$\w+/, cls: CL.attr },
    { re: /[A-Za-z_][\w]*(?=\s*\()/, cls: CL.fn },
    { re: /\b\d+\.?\d*([eE][+-]?\d+)?\b/, cls: CL.number },
    { re: /[{}()\[\];,.]/, cls: CL.punct },
    { re: /[-+*/%=<>!&|^~?.@]+/, cls: CL.op },
  ],
  java: [
    { re: /\/\/[^\n]*/, cls: CL.comment },
    { re: /\/\*[\s\S]*?\*\//, cls: CL.comment },
    { re: /"(?:\\.|[^"\\])*"/, cls: CL.string },
    { re: /\b(true|false|null)\b/, cls: CL.bool },
    { re: /\b(abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while|var|yield|record|sealed|permits)\b/, cls: CL.keyword },
    { re: /\b[A-Z][A-Za-z0-9_]*\b/, cls: CL.def },
    { re: /[A-Za-z_][\w]*(?=\s*\()/, cls: CL.fn },
    { re: /\b0[xX][0-9a-fA-F]+|\d+\.?\d*([eE][+-]?\d+)?[fFlLuUdD]?\b/, cls: CL.number },
    { re: /[{}()\[\];,.]/, cls: CL.punct },
    { re: /[-+*/%=<>!&|^~?:]+/, cls: CL.op },
  ],
};

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  if (i <= 0) return '';
  return name.slice(i + 1).toLowerCase();
}

export function fileTypeOf(e: FileEntry): FileType {
  if (e.is_dir) return 'folder';
  const ext = extOf(e.name);
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (ARCHIVE_EXTS.has(ext)) return 'archive';
  if (PDF_EXTS.has(ext)) return 'pdf';
  if (DOC_EXTS.has(ext)) return 'doc';
  if (SHEET_EXTS.has(ext)) return 'sheet';
  if (JSON_EXTS.has(ext)) return 'json';
  if (CONFIG_EXTS.has(ext)) return 'config';
  if (MARKUP_EXTS.has(ext)) return 'markup';
  if (SCRIPT_EXTS.has(ext)) return 'script';
  if (CODE_EXTS.has(ext)) return 'code';
  if (BINARY_EXTS.has(ext)) return 'binary';
  if (ext === 'txt' || !ext) return 'text';
  return 'text';
}

export const iconColorFor = (kind: FileType): string => {
  switch (kind) {
    case 'folder': return 'text-sky-300';
    case 'image': return 'text-pink-300';
    case 'video': return 'text-rose-300';
    case 'audio': return 'text-fuchsia-300';
    case 'archive': return 'text-amber-300';
    case 'pdf': return 'text-red-300';
    case 'doc': return 'text-blue-300';
    case 'sheet': return 'text-emerald-300';
    case 'json': return 'text-yellow-300';
    case 'config': return 'text-violet-300';
    case 'markup': return 'text-orange-300';
    case 'code': return 'text-cyan-300';
    case 'script': return 'text-lime-300';
    case 'binary': return 'text-gray-500';
    case 'text':
    default: return 'text-gray-300';
  }
};

export function editorLangFrom(e: FileEntry): HLMode {
  if (e.is_dir) return 'plain';
  const ext = extOf(e.name);
  switch (ext) {
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
      return 'js';
    case 'ts':
    case 'tsx':
      return 'ts';
    case 'json':
    case 'geojson':
    case 'jsonc':
      return 'json';
    case 'yaml':
    case 'yml':
      return 'yaml';
    case 'toml':
      return 'toml';
    case 'ini':
    case 'cfg':
    case 'conf':
    case 'properties':
      return 'ini';
    case 'env':
      return 'env';
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
    case 'ps1':
    case 'psm1':
    case 'bat':
    case 'cmd':
      return 'sh';
    case 'html':
    case 'htm':
    case 'xml':
      return 'markup';
    case 'md':
    case 'markdown':
      return 'md';
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return 'css';
    case 'go':
      return 'go';
    case 'py':
      return 'py';
    case 'sql':
      return 'sql';
    case 'csv':
      return 'csv';
    case 'c':
    case 'h':
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
      return 'c';
    case 'rb':
      return 'rb';
    case 'php':
      return 'php';
    case 'java':
    case 'kt':
      return 'java';
    default:
      return 'plain';
  }
}

export function highlightLine(line: string, mode: HLMode): HLToken[] {
  const rules = HL_RULES[mode];
  if (!rules || rules.length === 0) return [{ text: line, cls: '' }];
  const out: HLToken[] = [];
  let pos = 0;
  while (pos < line.length) {
    let matched = false;
    for (const r of rules) {
      r.re.lastIndex = pos;
      const m = r.re.exec(line);
      if (m && m.index === pos && m[0].length > 0) {
        out.push({ text: m[0], cls: r.cls });
        pos += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      let next = pos + 1;
      while (next < line.length) {
        let hit = false;
        for (const r of rules) {
          r.re.lastIndex = next;
          const m = r.re.exec(line);
          if (m && m.index === next) { hit = true; break; }
        }
        if (hit) break;
        next++;
      }
      out.push({ text: line.slice(pos, next), cls: '' });
      pos = next;
    }
    if (pos === line.length) break;
  }
  return out;
}
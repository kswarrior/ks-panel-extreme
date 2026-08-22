// Files page types - extracted from Files.tsx

export interface FileEntry {
  name: string;
  size: number;
  is_dir: boolean;
  mod_time: number;
  mode?: string;
}

export type FileType =
  | 'folder'
  | 'code'
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'archive'
  | 'pdf'
  | 'doc'
  | 'sheet'
  | 'config'
  | 'json'
  | 'markup'
  | 'script'
  | 'binary';

export const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']);
export const VIDEO_EXTS = new Set(['mp4', 'mkv', 'webm', 'mov', 'avi', 'flv', 'wmv']);
export const AUDIO_EXTS = new Set(['mp3', 'ogg', 'wav', 'flac', 'aac', 'm4a', 'opus']);
export const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'zst']);
export const PDF_EXTS = new Set(['pdf']);
export const DOC_EXTS = new Set(['doc', 'docx', 'odt', 'rtf', 'pages']);
export const SHEET_EXTS = new Set(['xls', 'xlsx', 'ods', 'csv', 'tsv']);
export const JSON_EXTS = new Set(['json', 'geojson', 'jsonc', 'lock']);
export const CONFIG_EXTS = new Set(['yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'properties']);
export const MARKUP_EXTS = new Set(['html', 'htm', 'xml', 'md', 'markdown', 'rst', 'tex']);
export const CODE_EXTS = new Set([
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'go', 'rs', 'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'java', 'kt', 'swift', 'rb', 'php', 'c#', 'cs', 'csx', 'lua', 'pl', '.pm', 'pas', 'd', 'nim', 'zig', 'v', 'ex', 'exs', 'erl', 'clj', 'lisp', 'el', 'r', 'scala', 'dart', 'gradle', 'ktm', 'kts',
]);
export const SCRIPT_EXTS = new Set(['sh', 'bash', 'zsh', 'fish', 'ps1', 'psm1', 'bat', 'cmd']);
export const BINARY_EXTS = new Set(['exe', 'dll', 'so', 'dylib', 'o', 'obj', 'a', 'lib', 'bin', 'class', 'jar', 'war', 'pyc', 'pyo', 'wasm', 'dat', 'db', 'sqlite', 'sqlite3', 'bin']);

export type HLMode =
  | 'plain' | 'js' | 'ts' | 'json' | 'yaml' | 'toml' | 'ini' | 'env'
  | 'sh' | 'markup' | 'md' | 'css' | 'go' | 'py' | 'sql'
  | 'csv' | 'c' | 'rb' | 'php' | 'java';

export interface HLRule { re: RegExp; cls: string; }
export interface HLToken { text: string; cls: string; }
export interface RowAction {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
  icon?: React.ReactNode;
}

export interface CodeEditorProps {
  value: string;
  onChange: (v: string) => void;
  mode: HLMode;
  readOnly?: boolean;
  onSave?: () => void;
}
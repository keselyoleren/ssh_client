// How the file manager opens a file it is asked to open (double-click, Enter, "Open").
//   image  → built-in preview
//   binary → the app the OS associates with it (remote files are downloaded to a temp folder)
//   text   → built-in text editor (anything not known to be binary, so configs without an
//            extension such as Dockerfile or .bashrc still open there)

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif'])

const BINARY = new Set([
  // documents
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  'pages',
  'numbers',
  'key',
  'rtf',
  'epub',
  // media
  'mp3',
  'wav',
  'flac',
  'ogg',
  'm4a',
  'aac',
  'mp4',
  'mkv',
  'mov',
  'avi',
  'webm',
  'wmv',
  'heic',
  'tif',
  'tiff',
  'psd',
  // archives & packages
  'zip',
  'tar',
  'gz',
  'tgz',
  'bz2',
  'xz',
  'zst',
  '7z',
  'rar',
  'jar',
  'war',
  'deb',
  'rpm',
  'apk',
  'dmg',
  'iso',
  'pkg',
  'msi',
  'whl',
  // executables, libraries, data
  'exe',
  'dll',
  'so',
  'dylib',
  'bin',
  'o',
  'a',
  'class',
  'pyc',
  'wasm',
  'sqlite',
  'sqlite3',
  'db',
  'parquet',
  // fonts
  'ttf',
  'otf',
  'woff',
  'woff2',
])

export const extOf = (name) => {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

// Opening these with the default app would run or install them, so K-Shell never does.
// Keep in step with BLOCKED in src-tauri/src/commands/files.rs.
const RUNS = new Set([
  'exe',
  'msi',
  'bat',
  'cmd',
  'com',
  'scr',
  'ps1',
  'vbs',
  'js',
  'jse',
  'wsf',
  'hta',
  'lnk',
  'reg',
  'app',
  'pkg',
  'dmg',
  'command',
  'tool',
  'workflow',
  'jar',
  'deb',
  'rpm',
  'apk',
  'appimage',
  'sh',
  'run',
  'bin',
  'py',
  'pyw',
  'vbe',
  'msix',
  'appx',
  'msp',
  'cpl',
  'pif',
  'jnlp',
  'scpt',
  'terminal',
  'desktop',
])
export const runsWhenOpened = (name) => RUNS.has(extOf(name))

/** 'image' | 'binary' | 'text' */
export function fileKind(name) {
  const ext = extOf(name)
  if (IMAGE.has(ext)) return 'image'
  if (BINARY.has(ext)) return 'binary'
  return 'text'
}

export const IMAGE_MIME = {
  svg: 'image/svg+xml',
  jpg: 'image/jpeg',
  ico: 'image/x-icon',
}

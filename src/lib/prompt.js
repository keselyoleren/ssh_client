// K-Shell prompt: the user picks segments in Settings; we turn them into a small bash/zsh
// snippet that installs a prompt hook. TerminalPane types it into new sessions and hides
// the echo (see MARKER).

/** Longest directory shown by the "Directory" segment; longer paths become "…tail". */
export const CWD_MAX = 40

/** Segment catalogue. color = ANSI colour index (1 red … 7 white). */
export const SEGMENTS = {
  venv: {
    label: 'Python venv',
    icon: 'terminal',
    color: 3,
    sample: '(venv)',
    dyn: '[ -n "$VIRTUAL_ENV" ] && v="(${VIRTUAL_ENV##*/})"',
    hint: 'Shown while a virtualenv is active',
  },
  conda: {
    label: 'Conda env',
    icon: 'terminal',
    color: 2,
    sample: '(base)',
    dyn: 'v=${CONDA_DEFAULT_ENV:+($CONDA_DEFAULT_ENV)}',
    hint: 'Shown while a conda environment is active',
  },
  user_host: { label: 'user@host', icon: 'user', color: 2, sample: 'user@server', bash: '\\u@\\h', zsh: '%n@%m' },
  user: { label: 'User', icon: 'user', color: 2, sample: 'user', bash: '\\u', zsh: '%n' },
  host: { label: 'Host', icon: 'server', color: 6, sample: 'server', bash: '\\h', zsh: '%m' },
  cwd: {
    label: 'Directory',
    icon: 'folder',
    color: 4,
    sample: '…yoleren/project/chronicle/fork/core-api',
    hint: `Long paths are shortened from the left to ${CWD_MAX} characters`,
    // zsh truncates natively; bash: ~ for $HOME, keep the last CWD_MAX-1 chars, drop chars bash would expand
    zsh: `%${CWD_MAX}<…<%~%<<`,
    bashDyn:
      'v=$PWD; case $v in "$HOME"|"$HOME"/*) v="~${v#"$HOME"}";; esac; ' +
      `[ \${#v} -gt ${CWD_MAX} ] && v="…\${v:\${#v}-${CWD_MAX - 1}}"; v=\${v//[\\$\\\`\\\\]/}`,
  },
  dir: { label: 'Directory name', icon: 'folder', color: 4, sample: 'app', bash: '\\W', zsh: '%1~' },
  git: {
    label: 'Git branch',
    icon: 'branch',
    color: 5,
    sample: 'main',
    dyn: 'v=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)',
    hint: 'Shown inside a git repository',
  },
  kube: {
    label: 'Kube context',
    icon: 'cube',
    color: 4,
    sample: 'prod-cluster',
    dyn: 'k=${KUBECONFIG:-$HOME/.kube/config}; v=$(sed -n \'s/^current-context: *//p\' "${k%%:*}" 2>/dev/null)',
    hint: 'Read from your kubeconfig',
  },
  time: { label: 'Time (24h)', icon: 'clock', color: 6, sample: '15:48', bash: '\\A', zsh: '%T' },
  time12: { label: 'Time (12h)', icon: 'clock', color: 1, sample: '03:48 PM', bash: '\\@', zsh: '%t' },
  date: { label: 'Date', icon: 'calendar', color: 3, sample: 'Nov 04', bash: '\\D{%b %d}', zsh: '%D{%b %d}' },
  exit: {
    label: 'Exit code',
    icon: 'info',
    color: 1,
    sample: '[1]',
    dyn: '[ "$e" != 0 ] && v="[$e]"',
    safe: true,
    hint: 'Shown only when the last command failed',
  },
  symbol: { label: 'Prompt symbol', icon: 'right', color: 7, sample: '$', bash: '\\$', zsh: '%#' },
  newline: { label: 'Line break', icon: 'newline', multi: true },
}

export const DEFAULT_PROMPT = ['venv', 'user_host', 'cwd', 'git', 'exit', 'symbol']

/** OSC sequence the snippet prints when it is done; xterm ignores unknown OSCs. */
export const MARKER = '\x1b]7770;k\x07'

const wrap = (shell, n) => (shell === 'zsh' ? [`%F{${n}}`, '%f'] : [`\\[\\e[3${n}m\\]`, '\\[\\e[0m\\]'])

function fnBody(shell, ids) {
  const out = []
  for (const id of ids) {
    const seg = SEGMENTS[id]
    if (!seg) continue
    if (id === 'newline') {
      out.push("p+=$'\\n'; s=")
      continue
    }
    const [o, c] = wrap(shell, seg.color)
    if (shell === 'bash' && seg.bashDyn) out.push(`v=; ${seg.bashDyn}; _ksp_add '${o}'"$v"'${c}'`)
    else if (seg.dyn)
      out.push(
        `v=; ${seg.dyn}; ${seg.safe ? '' : 'v=${v//[^[:alnum:]._\\/@:()+-]/}; '}[ -n "$v" ] && _ksp_add '${o}'"$v"'${c}'`,
      )
    else out.push(`_ksp_add '${o}${seg[shell]}${c}'`)
  }
  const assign = shell === 'zsh' ? 'PROMPT="$p "; RPROMPT=' : 'PS1="$p "'
  return `_ksp(){ local e=$_ksp_e p= s= v k; ${out.join('; ')}; ${assign}; }`
}

/** Shell code (bash + zsh) that installs the prompt in the current shell. */
export function promptScript(ids) {
  return [
    '_ksp_add(){ [ -n "$s" ] && p+=\' \'; p+="$1"; s=1; }',
    '_ksp_st(){ _ksp_e=$?; }',
    'export VIRTUAL_ENV_DISABLE_PROMPT=1',
    `if [ -n "$ZSH_VERSION" ]; then ${fnBody('zsh', ids)}; precmd_functions=(_ksp_st \${precmd_functions:#_ksp*} _ksp)`,
    `else ${fnBody('bash', ids)}; PROMPT_COMMAND=$'_ksp_st\\n'"\${PROMPT_COMMAND}"$'\\n_ksp'; fi`,
  ].join('; ')
}

/** Readable version for ~/.bashrc / ~/.zshrc. */
export function promptRcSnippet(ids) {
  return `# K-Shell prompt (bash / zsh)\n${promptScript(ids)}\n`
}

const sq = (s) => `'${s.replace(/'/g, "'\\''")}'`

/**
 * Shell code (bash + zsh) that reports the working directory after every command with
 * OSC 7 (file://host/path), the sequence terminals use to follow the shell's folder.
 */
export const CWD_SCRIPT = [
  `_kscwd(){ printf '\\033]7;file://%s%s\\007' "\${HOSTNAME:-$HOST}" "$PWD"; }`,
  'if [ -n "$ZSH_VERSION" ]; then precmd_functions=(${precmd_functions:#_kscwd} _kscwd)',
  `else case "$PROMPT_COMMAND" in *_kscwd*) ;; *) PROMPT_COMMAND="\${PROMPT_COMMAND}"$'\\n_kscwd';; esac; fi`,
].join('; ')

/**
 * One line typed into a fresh shell, built from a plan:
 *   prompt: segment ids of the K-Shell prompt (or null)
 *   cwd:    report the working directory (OSC 7)
 *   cd:     folder to change to first (reconnect / reopened tab)
 * Shells other than bash/zsh skip the eval (fish parses it but the test is false) and still
 * print the marker so the echo can be hidden.
 */
export function promptInjection({ prompt = null, cwd = false, cd = '' } = {}) {
  const parts = []
  if (cd) parts.push(`cd -- ${sq(cd)} 2>/dev/null`)
  if (cwd) parts.push(CWD_SCRIPT)
  if (prompt?.length) parts.push(promptScript(prompt))
  // bash: drop the typed line from history (it contains the marker text 7770). zsh adds the
  // line before we run, so it stays unless the user has HIST_IGNORE_SPACE.
  parts.push(
    '_ksp_h(){ case "$(history 1)" in *7770*) set -- $(history 1); history -d "$1";; esac; }; [ -n "$BASH_VERSION" ] && _ksp_h',
  )
  return ` [ -n "$BASH_VERSION$ZSH_VERSION" ] && eval ${sq(parts.join('; '))}; printf '\\033]7770;k\\007'\r`
}

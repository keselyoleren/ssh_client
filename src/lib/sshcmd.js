// Convert between `ssh -L/-R/-D …` command lines and K-Shell forwarding rules.

const VALUE_FLAGS = new Set('bcDEeFIiJLlmOoPpQRSWw'.split('')) // ssh options that take an argument

/** Split a command line on whitespace, honouring single/double quotes and backslash escapes. */
function tokenize(s) {
  const out = []
  let cur = '',
    q = null,
    has = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === q) q = null
      else if (c === '\\' && q === '"' && i + 1 < s.length) cur += s[++i]
      else cur += c
    } else if (c === '"' || c === "'") {
      q = c
      has = true
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[++i]
      has = true
    } else if (/\s/.test(c)) {
      if (has || cur) out.push(cur)
      cur = ''
      has = false
    } else cur += c
  }
  if (has || cur) out.push(cur)
  return out
}

/** "a:b:c" with optional [ipv6] parts -> ['a', 'b', 'c'] */
function splitColons(spec) {
  const parts = []
  let cur = '',
    br = false
  for (const c of spec) {
    if (c === '[') br = true
    else if (c === ']') br = false
    else if (c === ':' && !br) {
      parts.push(cur)
      cur = ''
      continue
    } else cur += c
  }
  parts.push(cur)
  return parts
}

const port = (v) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : null
}

/** One -L / -R / -D argument -> rule fields, or an error string. */
function parseSpec(kind, spec) {
  const p = splitColons(spec)
  if (kind === 'dynamic') {
    if (p.length > 2) return `-D ${spec}: expected [bind_address:]port`
    const bp = port(p.at(-1))
    if (!bp) return `-D ${spec}: invalid port`
    return { kind, bind_host: p.length === 2 && p[0] ? p[0] : '127.0.0.1', bind_port: bp, dest_host: '', dest_port: 0 }
  }
  const flag = kind === 'local' ? '-L' : '-R'
  if (p.length !== 3 && p.length !== 4) return `${flag} ${spec}: expected [bind_address:]port:host:hostport`
  const [bind, bp, dh, dp] = p.length === 4 ? p : ['', ...p]
  if (!port(bp) || !port(dp) || !dh) return `${flag} ${spec}: invalid port or host`
  return { kind, bind_host: bind || '127.0.0.1', bind_port: port(bp), dest_host: dh, dest_port: port(dp) }
}

/**
 * Parse an ssh command line.
 * Returns { user, host, port, forwards: [rule fields], errors: [string] }.
 */
export function parseSshCommand(line) {
  const t = tokenize(line.trim())
  const res = { user: '', host: '', port: 22, forwards: [], errors: [] }
  let i = t[0] === 'ssh' || t[0]?.endsWith('/ssh') ? 1 : 0
  for (; i < t.length; i++) {
    const a = t[i]
    if (a === '--') continue
    if (a.startsWith('-') && a.length > 1) {
      // clustered flags: -NfL 8080:… or -L8080:…
      for (let j = 1; j < a.length; j++) {
        const f = a[j]
        if (!VALUE_FLAGS.has(f)) continue
        const val = a.length > j + 1 ? a.slice(j + 1) : t[++i]
        if (val == null) {
          res.errors.push(`-${f} needs a value`)
          break
        }
        if (f === 'L' || f === 'R' || f === 'D') {
          const r = parseSpec({ L: 'local', R: 'remote', D: 'dynamic' }[f], val)
          typeof r === 'string' ? res.errors.push(r) : res.forwards.push(r)
        } else if (f === 'p') res.port = port(val) || res.port
        else if (f === 'l') res.user = val
        break
      }
      continue
    }
    if (res.host) continue // remote command after the destination
    let dest = a
    const url = /^ssh:\/\/(?:([^@]+)@)?(\[[^\]]+\]|[^:/]+)(?::(\d+))?/.exec(dest)
    if (url) {
      if (url[1]) res.user = url[1]
      res.host = url[2].replace(/^\[|\]$/g, '')
      if (url[3]) res.port = port(url[3]) || res.port
      continue
    }
    const at = dest.lastIndexOf('@')
    if (at >= 0) {
      res.user = dest.slice(0, at)
      dest = dest.slice(at + 1)
    }
    res.host = dest
  }
  if (!res.host) res.errors.push('No destination host (user@host) found')
  if (!res.forwards.length) res.errors.push('No -L, -R or -D tunnel found')
  return res
}

/** Saved hosts matching a parsed command: exact user+host+port first, then host+port, then host. */
export function matchHosts(parsed, hosts) {
  const ssh = hosts.filter((h) => h.protocol === 'ssh' && h.host === parsed.host)
  const p = (h) => +h.port || 22
  const exact = ssh.filter((h) => p(h) === parsed.port && (!parsed.user || h.username === parsed.user))
  if (exact.length) return exact
  const samePort = ssh.filter((h) => p(h) === parsed.port)
  return samePort.length ? samePort : ssh
}

const hostPart = (h) => (h.includes(':') ? `[${h}]` : h)

/** The equivalent `ssh` command for a rule and its host. */
export function toSshCommand(f, h) {
  if (!h) return ''
  const local = (b) => !b || b === '127.0.0.1' || b === 'localhost'
  const bind = local(f.bind_host) ? '' : `${hostPart(f.bind_host)}:`
  const spec =
    f.kind === 'dynamic'
      ? `-D ${bind}${f.bind_port}`
      : `${f.kind === 'remote' ? '-R' : '-L'} ${bind}${f.bind_port}:${hostPart(f.dest_host)}:${f.dest_port}`
  const port = (+h.port || 22) !== 22 ? ` -p ${h.port}` : ''
  return `ssh -N ${spec} ${h.username ? h.username + '@' : ''}${h.host}${port}`
}

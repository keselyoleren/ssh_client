export function join(dir, name, sep = '/') {
  if (!dir) return name
  return dir.endsWith(sep) ? dir + name : dir + sep + name
}
export function parent(path, sep = '/') {
  if (sep === '\\') {
    const t = path.replace(/\\+$/, '')
    if (/^[A-Za-z]:$/.test(t)) return '' // drive root -> drive list
    const i = t.lastIndexOf('\\')
    const p = t.slice(0, i)
    return /^[A-Za-z]:$/.test(p) ? p + '\\' : p
  }
  if (path === '/' || !path) return '/'
  const p = path.replace(/\/+$/, '').replace(/\/[^/]*$/, '')
  return p || '/'
}
export function crumbs(path, sep = '/') {
  if (sep === '\\') {
    const parts = path.split('\\').filter(Boolean)
    return parts.map((p, i) => ({ name: p, path: parts.slice(0, i + 1).join('\\') + (i === 0 ? '\\' : '') }))
  }
  const parts = path.split('/').filter(Boolean)
  return [{ name: '/', path: '/' }, ...parts.map((p, i) => ({ name: p, path: '/' + parts.slice(0, i + 1).join('/') }))]
}

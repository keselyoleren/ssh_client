// Visual identity for hosts: OS / protocol badge colour + short label.
const OS = {
  ubuntu: ['#e95420', 'U'],
  debian: ['#a80030', 'D'],
  centos: ['#932279', 'C'],
  rhel: ['#cc0000', 'R'],
  fedora: ['#294172', 'F'],
  rocky: ['#10b981', 'R'],
  almalinux: ['#0f4266', 'A'],
  arch: ['#1793d1', 'A'],
  alpine: ['#0d597f', 'A'],
  amzn: ['#ff9900', 'A'],
  opensuse: ['#73ba25', 'S'],
  linux: ['#475569', 'L'],
  darwin: ['#6b7280', ''],
  freebsd: ['#ab2b28', 'B'],
  raspbian: ['#c51a4a', 'P'],
  kali: ['#367bf0', 'K'],
}
// Muted, earthy colours; a host always gets the same one (derived from its name).
const PALETTE = ['#C8553D', '#2F5D8A', '#5B7F4E', '#8A5A44', '#6B5B95', '#B07D2B', '#3E7C7B', '#7A4E6B']
function pick(name) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function badge(h) {
  if (h.protocol === 's3') return { bg: '#C27C2C', text: 'S3', icon: 'cloud' }
  if (h.protocol === 'ftp' || h.protocol === 'ftps') return { bg: '#6B5B95', text: 'FTP', icon: 'folder' }
  if (h.color) return { bg: h.color, text: (h.label || h.host || '?')[0].toUpperCase() }
  const o = OS[h.os]
  if (o) return { bg: o[0], text: o[1] || (h.label || '?')[0].toUpperCase() }
  return {
    bg: pick(h.label || h.host || ''),
    text: (h.label || h.host || '?')[0].toUpperCase(),
  }
}
export const PROTOCOLS = [
  { id: 'ssh', label: 'SSH / SFTP', port: 22 },
  { id: 'ftp', label: 'FTP', port: 21 },
  { id: 'ftps', label: 'FTPS (explicit TLS)', port: 21 },
  { id: 's3', label: 'S3 / Object Storage', port: 0 },
]
export const S3_PRESETS = [
  { label: 'AWS S3', endpoint: '', region: 'us-east-1' },
  { label: 'Cloudflare R2', endpoint: 'https://<account-id>.r2.cloudflarestorage.com', region: 'auto' },
  { label: 'MinIO', endpoint: 'http://localhost:9000', region: 'us-east-1' },
  { label: 'DigitalOcean Spaces', endpoint: 'https://sgp1.digitaloceanspaces.com', region: 'sgp1' },
  { label: 'Wasabi', endpoint: 'https://s3.ap-southeast-1.wasabisys.com', region: 'ap-southeast-1' },
  { label: 'Backblaze B2', endpoint: 'https://s3.us-west-004.backblazeb2.com', region: 'us-west-004' },
  { label: 'Google Cloud Storage', endpoint: 'https://storage.googleapis.com', region: 'auto' },
]

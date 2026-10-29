// Session text goes to Haiku, so likely secrets are swapped for a placeholder
// first. A false positive only costs the question a little context; a miss
// sends a credential away, so the patterns lean toward redacting.

const KEY = '[redacted key]'
const SECRET = '[redacted secret]'

// Known shapes, most specific first so `sk-ant-` is not half-matched by `sk-`.
const FORMATS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+/g,
  /\bsk-ant-[A-Za-z0-9_-]{16,}/g,
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bxox[bpas]-[A-Za-z0-9-]{10,}/g,
]

// A token holds a digit or symbol, so prose like "Basic authentication" survives.
const BEARER = /\b(Bearer|Basic)\s+(?=[A-Za-z]*[0-9._~+/=-])[A-Za-z0-9._~+/=-]{8,}/g
// An upper-case name with a secret-ish word, as in .env files and constants.
const NAME = String.raw`\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|API)[A-Z0-9_]*)`
// `NAME = "value"`: a quoted literal is a hard-coded value, whatever the spacing.
const QUOTED = new RegExp(String.raw`${NAME}(\s*[=:]\s*)(["'\`])[^"'\`\n]+\3`, 'g')
// `NAME=value`, env style. A value starting with `$` is a reference, not a secret.
const ENV = new RegExp(String.raw`${NAME}=([^\s"'\`$][^\s"'\`]*)`, 'g')

const LONG = /[A-Za-z0-9+/=_-]{32,}/g

// Random keys mix cases and digits in every position; long identifiers and
// paths are mostly lower-case words, which random text rarely spells out.
function looksRandom(s: string): boolean {
  if (/^[0-9a-f]+$/i.test(s)) return /[0-9]/.test(s) && /[a-f]/i.test(s)
  const digits = s.replace(/[^0-9]/g, '').length
  const wordy = (s.match(/[a-z]{3,}/g) ?? []).join('').length / s.length
  return /[a-z]/.test(s) && /[A-Z]/.test(s) && digits >= 2 && wordy < 0.4
}

export function redact(text: string): string {
  let out = text
  for (const re of FORMATS) out = out.replace(re, KEY)
  out = out.replace(BEARER, (_, scheme: string) => `${scheme} ${KEY}`)
  out = out.replace(QUOTED, (_, name: string, sep: string, quote: string) => `${name}${sep}${quote}${SECRET}${quote}`)
  out = out.replace(ENV, (_, name: string) => `${name}=${SECRET}`)
  return out.replace(LONG, s => (looksRandom(s) ? KEY : s))
}

// Files whose contents are secrets: no line about them is sent at all.
export function isSecretPath(path: string): boolean {
  const name = path.split(/[\\/]/).pop() ?? ''
  return /^\.env(\..+)?$/.test(name) || /\.pem$/i.test(name) || /^id_rsa/.test(name) || /^credentials/i.test(name)
}

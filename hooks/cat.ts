const BODY = [
  '..............o..o',
  '.o............oooo',
  'o.............oeon',
  'o..ooooooooooooooo',
  '.ooooooooooooooo..',
  '..oooooooooooooo..',
  '...oooooooooooo...',
]
const LEGS = [
  ['...o.o......o.o...', '..o...o....o...o..'],
  ['....oo......oo....', '....oo......oo....'],
]
const COLORS: Record<string, number> = { o: 0xe0a35a, e: 0x1b1c20, n: 0xf4b8a8 }
const DEFAULT = 0x01000000
const UPPER = 0x2580
const LOWER = 0x2584
const FULL = 0x2588
const SPACE = 0x20

export const CAT_WIDTH = BODY[0]?.length ?? 0
export const CAT_ROWS = Math.ceil((BODY.length + 2) / 2)

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63]! : '='
  }
  return out
}

export function catPosition(step: number, track: number): { x: number; right: boolean } {
  if (track <= 0) return { x: 0, right: true }
  const p = step % (2 * track)
  return p < track ? { x: p, right: true } : { x: 2 * track - p, right: false }
}

export function catSprite(step: number, right: boolean): string[] {
  const rows = [...BODY, ...(LEGS[step % 2] ?? [])]
  return right ? rows : rows.map(r => [...r].reverse().join(''))
}

export function catCells(width: number, step: number): string {
  const { x, right } = catPosition(step, width - CAT_WIDTH)
  const sprite = catSprite(step, right)
  const pixel = (row: number, col: number) => {
    const ch = sprite[row]?.[col - x]
    return ch === undefined ? undefined : COLORS[ch]
  }
  const words = new Uint32Array(width * CAT_ROWS * 3)
  for (let r = 0; r < CAT_ROWS; r++) {
    for (let c = 0; c < width; c++) {
      const top = pixel(r * 2, c)
      const bottom = pixel(r * 2 + 1, c)
      const cell =
        top === undefined && bottom === undefined ? [SPACE, DEFAULT, DEFAULT]
        : top === undefined ? [LOWER, bottom!, DEFAULT]
        : bottom === undefined ? [UPPER, top, DEFAULT]
        : top === bottom ? [FULL, top, DEFAULT]
        : [UPPER, top, bottom]
      words.set(cell, (r * width + c) * 3)
    }
  }
  return base64(new Uint8Array(words.buffer))
}

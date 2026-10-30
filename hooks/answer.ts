export type Typed = { lines: string[]; draft: string }

function breakLong(word: string, width: number): string[] {
  if (word.length <= width) return [word]
  const parts: string[] = []
  for (let i = 0; i < word.length; i += width) parts.push(word.slice(i, i + width))
  return parts
}

export function flow(lines: string[], value: string, width: number): Typed {
  const text = value.replace(/\n/g, ' ')
  if (text === '' && lines.length > 0) return { lines: lines.slice(0, -1), draft: lines[lines.length - 1] ?? '' }
  if (text.length <= width) return { lines, draft: text }
  const full: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    for (const part of breakLong(word, width)) {
      if (line !== '' && line.length + 1 + part.length > width) {
        full.push(`${line} `)
        line = part
      } else {
        line = line === '' ? part : `${line} ${part}`
      }
    }
  }
  return { lines: [...lines, ...full], draft: line }
}

export const answerOf = (t: Typed, last = t.draft) => t.lines.join('') + last

const SPOKEN: Record<string, number> = {
  '1': 0, one: 0, first: 0, a: 0,
  '2': 1, two: 1, to: 1, too: 1, second: 1, b: 1, be: 1, bee: 1,
  '3': 2, three: 2, third: 2, c: 2, see: 2, sea: 2,
  '4': 3, four: 3, for: 3, fourth: 3, d: 3, dee: 3,
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? []
export function spokenChoice(text: string, choices: string[]): number {
  const said = words(text)
  if (said.length <= 3) {
    for (const w of said) {
      const i = SPOKEN[w]
      if (i !== undefined && i < choices.length) return i
    }
  }
  const heard = new Set(said)
  const scores = choices.map(c => {
    const own = words(c).filter(w => w.length > 3)
    return own.length === 0 ? 0 : own.filter(w => heard.has(w)).length / own.length
  })
  const best = Math.max(...scores)
  if (best < 0.5 || scores.filter(s => s === best).length > 1) return -1
  return scores.indexOf(best)
}

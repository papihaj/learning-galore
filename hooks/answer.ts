type Typed = { lines: string[]; draft: string }

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

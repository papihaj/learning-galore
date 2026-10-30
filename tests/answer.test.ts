import { describe, expect, test } from 'claude-code/testing'

import { answerOf, flow, spokenChoice } from '../hooks/answer'

const PARAGRAPH =
  'Every insert must update each index as well as the table, so writes slow down as you add indexes. Reads get faster because the index points straight at the rows you need.'

function typeOut(text: string, width: number) {
  let t = { lines: [] as string[], draft: '' }
  for (const ch of text) t = flow(t.lines, t.draft + ch, width)
  return t
}

describe('flow', () => {
  test('typing a paragraph keeps every line within the width', () => {
    const t = typeOut(PARAGRAPH, 30)
    expect([...t.lines, t.draft].every(l => l.trimEnd().length <= 30)).toBe(true)
    expect(t.lines.length).toBeGreaterThan(3)
    expect(answerOf(t)).toBe(PARAGRAPH)
  })

  test('a pasted paragraph flows the same as typing it', () => {
    expect(answerOf(flow([], PARAGRAPH, 30))).toBe(PARAGRAPH)
  })

  test('backspacing past the start of a line brings the line before back', () => {
    let t = typeOut(PARAGRAPH, 30)
    for (let i = 0; i < 60; i++) t = flow(t.lines, t.draft.slice(0, -1), 30)
    expect(answerOf(t)).toBe(PARAGRAPH.slice(0, -60))
  })

  test('a word longer than a line is split across lines', () => {
    const t = flow([], 'a' + 'x'.repeat(70), 30)
    expect([...t.lines, t.draft].every(l => l.trimEnd().length <= 30)).toBe(true)
  })

  test('typed newlines become spaces', () => {
    expect(flow([], 'one\ntwo', 30).draft).toBe('one two')
  })
})

const CHOICES = [
  'Writes slow down because every index must be updated',
  'Reads slow down because the table gets locked',
  'Nothing changes since indexes are stored separately',
  'The database drops old rows to make room',
]

describe('spokenChoice', () => {
  test('a spoken number, ordinal or letter picks that choice', () => {
    expect(spokenChoice('two', CHOICES)).toBe(1)
    expect(spokenChoice('The third one.', CHOICES)).toBe(2)
    expect(spokenChoice('option D', CHOICES)).toBe(3)
    expect(spokenChoice('1', CHOICES)).toBe(0)
  })

  test("saying a choice's own words picks it", () => {
    expect(spokenChoice('writes slow down since every index must be updated', CHOICES)).toBe(0)
    expect(spokenChoice('I think the table gets locked so reads slow down', CHOICES)).toBe(1)
  })

  test('an unclear answer picks nothing', () => {
    expect(spokenChoice('hmm not sure', CHOICES)).toBe(-1)
    expect(spokenChoice('five', CHOICES)).toBe(-1)
  })
})

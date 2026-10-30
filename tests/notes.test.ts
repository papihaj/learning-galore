import { describe, expect, test } from 'claude-code/testing'

import type { Note, Quiz } from '../types'
import { appendNote, buildNote, NOTES_MAX, sortTerms, toMarkdown } from '../hooks/notes'

const QUIZ: Quiz = {
  status: 'answered',
  format: 'free',
  question: 'Why redact before clipping?',
  choices: [],
  correct: -1,
  selected: -1,
  explanation: '',
  answer: 'So a cut never leaves half a key.',
  draft: '',
  lines: [],
  feedback: 'Solid. Redacting first means no partial secret survives a cut.',
  verdict: 'solid',
  lesson: '',
  error: '',
  source: 'hooks/redact.ts',
  focus: '',
  term: 'Secret Redaction',
  definition: 'Swapping secrets for a placeholder before text leaves the machine.',
  next: '',
}

const note = (over: Partial<Note>): Note => ({
  day: '2026-10-29',
  question: 'Q',
  term: 'debounce',
  definition: 'Wait until input stops, then run once.',
  answer: 'a',
  verdict: 'solid',
  feedback: 'f',
  ...over,
})

describe('buildNote', () => {
  test('keeps the term in one spelling, its definition, and the source', () => {
    const n = buildNote(QUIZ, '2026-10-29')
    expect(n.term).toBe('secret redaction')
    expect(n.definition).toBe(QUIZ.definition)
    expect(n.source).toBe('hooks/redact.ts')
    expect(n.verdict).toBe('solid')
  })

  test('redacts a key typed into the answer', () => {
    const key = 'sk-ant-' + 'FAKE'.repeat(8)
    expect(buildNote({ ...QUIZ, answer: `I used ${key}` }, '2026-10-29').answer).not.toContain(key)
  })

  test('keeps the right choice for multiple choice', () => {
    const n = buildNote({ ...QUIZ, format: 'choice', choices: ['x', 'y'], correct: 1 }, '2026-10-29')
    expect(n.right).toBe('y')
  })
})

describe('sortTerms', () => {
  test('the latest graded answer decides strong or weak', () => {
    const notes = [
      note({ term: 'debounce', verdict: 'notYet' }),
      note({ term: 'debounce', verdict: 'solid' }),
      note({ term: 'composite index', verdict: 'partly' }),
      note({ term: 'idempotency', verdict: 'ungraded' }),
    ]
    expect(sortTerms(notes)).toEqual({ strong: ['debounce'], weak: ['composite index'] })
  })
})

describe('toMarkdown', () => {
  test('opens on the key terms, then the terms by verdict, then the questions by day', () => {
    const md = toMarkdown([
      note({ term: 'composite index', definition: 'old', verdict: 'notYet', question: 'Why index?' }),
      note({ term: 'composite index', definition: 'An index over several columns.', verdict: 'notYet', question: 'Why index?' }),
    ])
    expect(md).toContain('## Key terms\n\n- **composite index**: An index over several columns.\n\n## Terms to work on')
    expect(md.indexOf('## Terms to work on')).toBeLessThan(md.indexOf('- composite index'))
    expect(md).toContain('## Terms I know\n\nNothing yet.')
    expect(md).toContain('## 2026-10-29')
    expect(md).toContain('### Why index?')
  })
})

test('the notes keep only the newest answers', () => {
  let notes: Note[] = []
  for (let i = 0; i < NOTES_MAX + 3; i++) notes = appendNote(notes, note({ question: `Q${i}` }))
  expect(notes.length).toBe(NOTES_MAX)
  expect(notes[0]?.question).toBe('Q3')
})

import { describe, expect, test } from 'claude-code/testing'

import type { Note, Quiz } from '../types'
import { appendNote, buildNote, NOTES_MAX, sortTopics, toMarkdown } from '../hooks/notes'

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
  feedback: 'Solid. Redacting first means no partial secret survives a cut.',
  lesson: '',
  error: '',
  source: 'hooks/redact.ts',
  focus: '',
  topic: 'Secret Redaction',
}

const note = (over: Partial<Note>): Note => ({
  day: '2026-10-29',
  question: 'Q',
  topic: 'debouncing',
  answer: 'a',
  verdict: 'solid',
  feedback: 'f',
  ...over,
})

describe('buildNote', () => {
  test('keeps the topic in one spelling and the source', () => {
    const n = buildNote(QUIZ, 'solid', '2026-10-29')
    expect(n.topic).toBe('secret redaction')
    expect(n.source).toBe('hooks/redact.ts')
    expect(n.verdict).toBe('solid')
  })

  test('redacts a key typed into the answer', () => {
    const key = 'sk-ant-' + 'FAKE'.repeat(8)
    expect(buildNote({ ...QUIZ, answer: `I used ${key}` }, 'partly', '2026-10-29').answer).not.toContain(key)
  })

  test('keeps the right choice for multiple choice', () => {
    const n = buildNote({ ...QUIZ, format: 'choice', choices: ['x', 'y'], correct: 1 }, 'notYet', '2026-10-29')
    expect(n.right).toBe('y')
  })
})

describe('sortTopics', () => {
  test('the latest graded answer decides strong or weak', () => {
    const notes = [
      note({ topic: 'debouncing', verdict: 'notYet' }),
      note({ topic: 'debouncing', verdict: 'solid' }),
      note({ topic: 'sql indexes', verdict: 'partly' }),
      note({ topic: 'caching', verdict: 'ungraded' }),
    ]
    expect(sortTopics(notes)).toEqual({ strong: ['debouncing'], weak: ['sql indexes'] })
  })
})

describe('toMarkdown', () => {
  test('opens on the topics, then the questions by day', () => {
    const md = toMarkdown([note({ topic: 'sql indexes', verdict: 'notYet', question: 'Why index?' })])
    expect(md.indexOf('## Topics to work on')).toBeLessThan(md.indexOf('- sql indexes'))
    expect(md).toContain("## Topics I'm good at\n\nNothing yet.")
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

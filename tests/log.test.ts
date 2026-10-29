import { describe, expect, test } from 'claude-code/testing'

import type { LogRecord, Quiz } from '../types'
import { LOG_MAX, ankiField, appendRecord, buildRecord, keyIdea, toAnki, toMarkdown } from '../hooks/log'

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
  feedback: 'Solid. You named the risk. Redacting first means no partial secret survives a cut.',
  lesson: '',
  error: '',
  source: '',
  reviewFrom: '',
  focus: '',
  topic: '',
}

const free = (over: Partial<LogRecord> = {}): LogRecord => ({
  day: '2026-10-28',
  question: 'Why redact before clipping?',
  format: 'free',
  answer: 'So a cut never leaves half a key.',
  verdict: 'solid',
  feedback: 'Solid. You named the risk. Redacting first means no partial secret survives a cut.',
  ...over,
})

describe('buildRecord', () => {
  test('keeps a free-text answer without choices or source', () => {
    const r = buildRecord(QUIZ, 'solid', '2026-10-28')
    expect(r).toEqual(free())
    expect('choices' in r).toBe(false)
    expect('source' in r).toBe(false)
  })

  test('keeps choices, the right answer and the source for multiple choice', () => {
    const q: Quiz = { ...QUIZ, format: 'choice', choices: ['A', 'B', 'C', 'D'], correct: 2, selected: 0, answer: 'A', source: 'hooks/redact.ts' }
    const r = buildRecord(q, 'notYet', '2026-10-28')
    expect(r.format).toBe('choice')
    expect(r.choices).toEqual(['A', 'B', 'C', 'D'])
    expect(r.right).toBe('C')
    expect(r.source).toBe('hooks/redact.ts')
    expect(r.verdict).toBe('notYet')
  })

  test('marks an answer with no verdict as ungraded', () => {
    expect(buildRecord(QUIZ, undefined, '2026-10-28').verdict).toBe('ungraded')
  })

  test('redacts a secret typed into the answer', () => {
    const key = ['sk-', 'ant-', 'api03-', 'FAKEfake0123FAKEfake4567'].join('')
    const r = buildRecord({ ...QUIZ, answer: `I used ${key}`, feedback: `You pasted ${key}.` }, 'partly', '2026-10-28')
    expect(r.answer).not.toContain(key)
    expect(r.feedback).not.toContain(key)
    expect(r.answer).toContain('[redacted key]')
  })
})

test('appendRecord keeps only the newest records', () => {
  let log: LogRecord[] = []
  for (let i = 0; i < LOG_MAX + 5; i++) log = appendRecord(log, free({ question: `Q${i}` }))
  expect(log.length).toBe(LOG_MAX)
  expect(log[0]?.question).toBe('Q5')
  expect(log[log.length - 1]?.question).toBe(`Q${LOG_MAX + 4}`)
})

describe('toMarkdown', () => {
  const log: LogRecord[] = [
    free({ day: '2026-10-27', question: 'Old question?' }),
    free({ question: 'Kept question?' }),
    free({
      question: 'Missed question?',
      format: 'choice',
      answer: 'A',
      verdict: 'notYet',
      choices: ['A', 'B'],
      right: 'B',
      source: 'hooks/log.ts',
      feedback: 'Not yet. The answer is: B. Because.',
    }),
  ]
  const md = toMarkdown(log)

  test('opens with a total', () => {
    expect(md.startsWith('# Session Quiz review log\n\n3 answered, 1 missed.')).toBe(true)
  })

  test('puts the newest day first, one section per day', () => {
    expect(md.indexOf('## 2026-10-28')).toBeLessThan(md.indexOf('## 2026-10-27'))
    expect(md.match(/^## /gm)?.length).toBe(2)
  })

  test('lists misses first in a day, marked as missed', () => {
    expect(md).toContain('1 of 2 missed.')
    expect(md.indexOf('### Missed: Missed question?')).toBeLessThan(md.indexOf('### Kept question?'))
  })

  test('shows answer, verdict, right answer, source and feedback', () => {
    expect(md).toContain('1. A\n2. B')
    expect(md).toContain('- Verdict: Not yet\n- Your answer: A\n- Right answer: B\n- From: `hooks/log.ts`\n\nNot yet. The answer is: B. Because.')
  })

  test('keeps a multi-line answer on its bullet', () => {
    expect(toMarkdown([free({ answer: 'line one\n# line two' })])).toContain('- Your answer: line one # line two')
  })

  test('says so when empty', () => {
    expect(toMarkdown([])).toBe('# Session Quiz review log\n\nNo answers yet.\n')
  })
})

describe('keyIdea', () => {
  test('takes the last sentence', () => {
    expect(keyIdea('Partly. You got the cache. A miss falls through to the database.')).toBe('A miss falls through to the database.')
  })

  test('drops a "Key idea:" label', () => {
    expect(keyIdea('Not yet. Close. Key idea: indexes trade writes for reads.')).toBe('indexes trade writes for reads.')
  })

  test('keeps the whole feedback when it is one sentence', () => {
    expect(keyIdea('Solid.')).toBe('Solid.')
  })
})

describe('ankiField', () => {
  test('replaces tabs', () => {
    expect(ankiField('a\tb')).toBe('a b')
  })

  test('quotes a field with a newline or quote', () => {
    expect(ankiField('line one\nline two')).toBe('"line one\nline two"')
    expect(ankiField('say "hi"')).toBe('"say ""hi"""')
  })

  test('leaves plain text alone', () => {
    expect(ankiField('plain')).toBe('plain')
  })
})

describe('toAnki', () => {
  test('writes the header and one row per card', () => {
    const tsv = toAnki([
      free({ verdict: 'partly' }),
      free({ question: 'Pick one?', format: 'choice', choices: ['x', 'y'], right: 'y', verdict: 'notYet' }),
    ])
    expect(tsv).toBe(
      '#separator:tab\n#html:false\n#tags column:3\n' +
        'Why redact before clipping?\tRedacting first means no partial secret survives a cut.\tsession-quiz partly\n' +
        'Pick one?\ty\tsession-quiz not-yet\n',
    )
  })

  test('makes one card per question, tagged by the latest answer', () => {
    const tsv = toAnki([free({ verdict: 'notYet' }), free({ question: 'Other?' }), free({ verdict: 'solid' })])
    const rows = tsv.trim().split('\n').slice(3)
    expect(rows.length).toBe(2)
    expect(rows[1]).toContain('session-quiz solid')
  })
})

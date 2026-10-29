import type { LogRecord, Quiz, Verdict } from '../types'
import { redact } from './redact'

// Enough for months of review, and far under the store's 4 MiB.
export const LOG_MAX = 500

const LABELS: Record<LogRecord['verdict'], string> = {
  solid: 'Solid',
  partly: 'Partly',
  notYet: 'Not yet',
  ungraded: 'Ungraded',
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

// The answer is the one thing typed by hand with no redaction before it, and
// the feedback can quote it back, so both are cleaned before they are kept.
export function buildRecord(q: Quiz, verdict: Verdict | undefined, day: string): LogRecord {
  const isChoice = q.format === 'choice' && q.choices.length > 0
  return {
    day,
    question: q.question,
    format: isChoice ? 'choice' : 'free',
    answer: redact(q.answer),
    verdict: verdict ?? 'ungraded',
    feedback: redact(q.feedback),
    ...(q.source === '' ? {} : { source: q.source }),
    ...(isChoice ? { choices: q.choices, right: q.choices[q.correct] ?? '' } : {}),
  }
}

export const appendRecord = (log: LogRecord[], r: LogRecord) => [...log, r].slice(-LOG_MAX)

const isMissed = (r: LogRecord) => r.verdict === 'partly' || r.verdict === 'notYet'

function entry(r: LogRecord): string {
  const lines = [`### ${isMissed(r) ? 'Missed: ' : ''}${oneLine(r.question)}`, '']
  if (r.choices !== undefined) {
    lines.push('Choices:', '', ...r.choices.map((c, i) => `${i + 1}. ${oneLine(c)}`), '')
  }
  lines.push(`- Verdict: ${LABELS[r.verdict]}`, `- Your answer: ${oneLine(r.answer) || '(none)'}`)
  if (r.right !== undefined) lines.push(`- Right answer: ${oneLine(r.right)}`)
  if (r.source !== undefined) lines.push(`- From: \`${r.source}\``)
  if (r.feedback.trim() !== '') lines.push('', oneLine(r.feedback))
  return lines.join('\n')
}

// Newest day first; inside a day, misses come first so they are reviewed first.
export function toMarkdown(log: LogRecord[]): string {
  const missed = log.filter(isMissed).length
  const head = [
    '# Session Quiz review log',
    '',
    log.length === 0 ? 'No answers yet.' : `${log.length} answered, ${missed} missed.`,
  ]
  const days = new Map<string, LogRecord[]>()
  for (const r of log) days.set(r.day, [...(days.get(r.day) ?? []), r])
  const sections = [...days.keys()].sort().reverse().map(day => {
    const rows = days.get(day) ?? []
    const misses = rows.filter(isMissed)
    return [
      `## ${day}`,
      `${misses.length} of ${rows.length} missed.`,
      ...misses.map(entry),
      ...rows.filter(r => !isMissed(r)).map(entry),
    ].join('\n\n')
  })
  return [head.join('\n'), ...sections].join('\n\n') + '\n'
}

// GRADE_SYSTEM ends feedback with the key idea in one sentence; a reply that
// is only the verdict word keeps the whole feedback instead.
export function keyIdea(feedback: string): string {
  const sentences = oneLine(feedback).split(/(?<=[.!?])\s+/).filter(s => s !== '')
  const last = sentences[sentences.length - 1] ?? ''
  const idea = last.replace(/^key idea:\s*/i, '')
  return sentences.length > 1 && idea !== '' ? idea : oneLine(feedback)
}

// Anki's text import splits on tabs and reads a quoted field across lines,
// so tabs go and a field with a quote or newline is quoted.
export function ankiField(s: string): string {
  const flat = s.replace(/\t/g, ' ').replace(/\r\n?/g, '\n').trim()
  return /["\n]/.test(flat) ? `"${flat.replace(/"/g, '""')}"` : flat
}

const TAGS: Record<LogRecord['verdict'], string> = {
  solid: 'solid',
  partly: 'partly',
  notYet: 'not-yet',
  ungraded: 'ungraded',
}

// One card per question: asked again, the latest answer decides its tags.
export function toAnki(log: LogRecord[]): string {
  const cards = new Map<string, LogRecord>()
  for (const r of log) {
    const front = oneLine(r.question)
    cards.delete(front)
    cards.set(front, r)
  }
  const rows = [...cards].map(([front, r]) => {
    const back = r.right !== undefined && r.right !== '' ? r.right : keyIdea(r.feedback)
    return [front, back, `session-quiz ${TAGS[r.verdict]}`].map(ankiField).join('\t')
  })
  return ['#separator:tab', '#html:false', '#tags column:3', ...rows].join('\n') + '\n'
}

import type { Note, Quiz, Verdict } from '../types'
import { redact } from './redact'

// Years of answers, and well under the 4 MiB a single file read allows.
export const NOTES_MAX = 2000

const LABELS: Record<Note['verdict'], string> = {
  solid: 'Solid',
  partly: 'Partly',
  notYet: 'Not yet',
  ungraded: 'Ungraded',
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

export const topicKey = (topic: string) => oneLine(topic).toLowerCase().slice(0, 40)

// The answer is typed by hand with no redaction before it, and the feedback
// can quote it back, so both are cleaned before they are written to disk.
export function buildNote(q: Quiz, verdict: Verdict | undefined, day: string): Note {
  const isChoice = q.format === 'choice' && q.choices.length > 0
  return {
    day,
    question: q.question,
    topic: topicKey(q.topic),
    answer: redact(q.answer),
    verdict: verdict ?? 'ungraded',
    feedback: redact(q.feedback),
    ...(q.source === '' ? {} : { source: q.source }),
    ...(isChoice ? { right: q.choices[q.correct] ?? '' } : {}),
  }
}

export const appendNote = (notes: Note[], n: Note) => [...notes, n].slice(-NOTES_MAX)

// A topic's latest graded answer decides where it goes: a Solid puts it with
// the strong topics, a Partly or Not yet with the ones to work on.
export function sortTopics(notes: Note[]): { strong: string[]; weak: string[] } {
  const latest = new Map<string, Note['verdict']>()
  for (const n of notes) if (n.topic !== '' && n.verdict !== 'ungraded') latest.set(n.topic, n.verdict)
  const strong: string[] = []
  const weak: string[] = []
  for (const [topic, verdict] of latest) (verdict === 'solid' ? strong : weak).push(topic)
  return { strong: strong.sort(), weak: weak.sort() }
}

const list = (topics: string[], empty: string) => (topics.length === 0 ? empty : topics.map(t => `- ${t}`).join('\n'))

function entry(n: Note): string {
  const lines = [`### ${oneLine(n.question)}`, '']
  if (n.topic !== '') lines.push(`- Topic: ${n.topic}`)
  lines.push(`- Verdict: ${LABELS[n.verdict]}`, `- Your answer: ${oneLine(n.answer) || '(none)'}`)
  if (n.right !== undefined) lines.push(`- Right answer: ${oneLine(n.right)}`)
  if (n.source !== undefined) lines.push(`- From: \`${n.source}\``)
  if (n.feedback.trim() !== '') lines.push('', oneLine(n.feedback))
  return lines.join('\n')
}

// Topics first, so the file opens on what to study; then every question,
// newest day first.
export function toMarkdown(notes: Note[]): string {
  const { strong, weak } = sortTopics(notes)
  const days = new Map<string, Note[]>()
  for (const n of notes) days.set(n.day, [...(days.get(n.day) ?? []), n])
  const questions = [...days.keys()]
    .sort()
    .reverse()
    .map(day => [`## ${day}`, ...(days.get(day) ?? []).map(entry)].join('\n\n'))
  return (
    [
      '# Learning notes',
      '## Topics to work on',
      list(weak, 'Nothing yet.'),
      "## Topics I'm good at",
      list(strong, 'Nothing yet.'),
      '# Questions',
      ...(questions.length === 0 ? ['No answers yet.'] : questions),
    ].join('\n\n') + '\n'
  )
}

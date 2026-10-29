import type { Note, Quiz } from '../types'
import { redact } from './redact'

export const NOTES_MAX = 2000

const LABELS: Record<Note['verdict'], string> = {
  solid: 'Solid',
  partly: 'Partly',
  notYet: 'Not yet',
  ungraded: 'Ungraded',
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

export function buildNote(q: Quiz, day: string): Note {
  return {
    day,
    question: q.question,
    term: oneLine(q.term).toLowerCase().slice(0, 40),
    definition: oneLine(q.definition),
    answer: redact(q.answer),
    verdict: q.verdict ?? 'ungraded',
    feedback: redact(q.feedback),
    ...(q.source === '' ? {} : { source: q.source }),
    ...(q.format === 'choice' && q.choices.length > 0 ? { right: q.choices[q.correct] ?? '' } : {}),
  }
}

export const appendNote = (notes: Note[], n: Note) => [...notes, n].slice(-NOTES_MAX)

export function sortTerms(notes: Note[]): { strong: string[]; weak: string[] } {
  const latest = new Map<string, Note['verdict']>()
  for (const n of notes) if (n.term !== '' && n.verdict !== 'ungraded') latest.set(n.term, n.verdict)
  const strong: string[] = []
  const weak: string[] = []
  for (const [term, verdict] of latest) (verdict === 'solid' ? strong : weak).push(term)
  return { strong: strong.sort(), weak: weak.sort() }
}

const list = (items: string[]) => (items.length === 0 ? 'Nothing yet.' : items.map(t => `- ${t}`).join('\n'))

function entry(n: Note): string {
  const lines = [`### ${oneLine(n.question)}`, '']
  if (n.term !== '') lines.push(`- Term: ${n.term}`)
  lines.push(`- Verdict: ${LABELS[n.verdict]}`, `- Your answer: ${oneLine(n.answer) || '(none)'}`)
  if (n.right !== undefined) lines.push(`- Right answer: ${oneLine(n.right)}`)
  if (n.source !== undefined) lines.push(`- From: \`${n.source}\``)
  if (n.feedback.trim() !== '') lines.push('', oneLine(n.feedback))
  return lines.join('\n')
}

export function toMarkdown(notes: Note[]): string {
  const definitions = new Map<string, string>()
  for (const n of notes) if (n.term !== '' && n.definition !== '') definitions.set(n.term, n.definition)
  const { strong, weak } = sortTerms(notes)
  const days = new Map<string, Note[]>()
  for (const n of notes) days.set(n.day, [...(days.get(n.day) ?? []), n])
  const questions = [...days.keys()]
    .sort()
    .reverse()
    .map(day => [`## ${day}`, ...(days.get(day) ?? []).map(entry)].join('\n\n'))
  return (
    [
      '# Learning notes',
      '## Key terms',
      list([...definitions.keys()].sort().map(t => `**${t}**: ${definitions.get(t)}`)),
      '## Terms to work on',
      list(weak),
      '## Terms I know',
      list(strong),
      '# Questions',
      ...(questions.length === 0 ? ['No answers yet.'] : questions),
    ].join('\n\n') + '\n'
  )
}

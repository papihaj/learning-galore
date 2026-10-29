import { atom, read, update } from 'claude-code'
import type { EngineInterface as Api, Register, RenderChildren } from 'claude-code'

import type { Format, LogRecord, Quiz, QuizSettings, QuizStats, QuizUsage, ReviewItem, TokenLog, Verdict } from '../types'
import { applyPicks, CHECKIN_EVERY, checkLink, FOCUS_MAX, parseFocus, tallyTopic, topTopics } from './focus'
import type { Pick, TopicPrefs } from './focus'
import { appendRecord, buildRecord, toAnki, toMarkdown } from './log'
import { isSecretPath, redact } from './redact'
import { addDays, dayKey, dueItems, pickDue, schedule, upsert } from './review'

const PANE = 'session-quiz'
const MODEL = 'haiku'
// Caps on each call, so one question never costs much.
const ASK_MAX_TOKENS = 400
const GRADE_MAX_TOKENS = 300
const LESSON_MAX_TOKENS = 350
const CONTEXT_CHARS = 6000
const ANSWER_CHARS = 280

const EMPTY: Quiz = {
  status: 'idle',
  format: 'free',
  question: '',
  choices: [],
  correct: -1,
  selected: -1,
  explanation: '',
  answer: '',
  draft: '',
  feedback: '',
  lesson: '',
  error: '',
  source: '',
  reviewFrom: '',
  focus: '',
  topic: '',
}
const DEFAULTS: QuizSettings = { format: 'free' }
const NO_STATS: QuizStats = { answered: 0, solid: 0, partly: 0, notYet: 0, streak: 0, best: 0, lastDay: '' }

const quiz = atom({ plugin: 'session-quiz', key: 'quiz' } as const, EMPTY, {
  shape: 'quiz-8',
})
const usage = atom(
  { plugin: 'session-quiz', key: 'usage' } as const,
  { tokens: 0, questions: 0 },
  { shape: 'usage-1' },
)
const settings = atom(
  { plugin: 'session-quiz', key: 'settings' } as const,
  DEFAULTS,
  { shape: 'settings-2' },
)
const asked = atom({ plugin: 'session-quiz', key: 'asked' } as const, [], {
  shape: 'asked-1',
})
const showSettings = atom({ plugin: 'session-quiz', key: 'showSettings' } as const, false, {
  shape: 'show-settings-1',
})
// A copy of the stored daily token counts, so the Settings view redraws.
const tokenLog = atom({ plugin: 'session-quiz', key: 'tokenLog' } as const, {}, {
  shape: 'token-log-1',
})
// A copy of the stored stats, so the pane redraws when they change.
const checkin = atom({ plugin: 'session-quiz', key: 'checkin' } as const, false, {
  shape: 'checkin-1',
})
const picks = atom({ plugin: 'session-quiz', key: 'picks' } as const, {}, {
  shape: 'picks-1',
})
const stats = atom({ plugin: 'session-quiz', key: 'stats' } as const, NO_STATS, {
  shape: 'stats-1',
})

// How a good lecturer would review the session: retrieval practice, rotated
// through Bloom's levels, asking for reasons and transfer rather than recall.
const ASK_SYSTEM = `You are a professor who teaches software engineering well. Your student is a developer who just worked through the session below with a coding assistant. You write one review question that makes them retrieve and reason about the ideas behind that work, so they keep it.

How you teach:
- Ask only about the big, central ideas of the session: the concepts a senior engineer would want the student to still know in a year. Skip small details, syntax, configuration, and trivia (file names, exact code, what the assistant said).
- The question must be answerable from understanding alone, in one or two sentences (under ${ANSWER_CHARS} characters). If an idea needs a long essay, ask about one part of it.
- Ask for reasons: "why", "how", "what would happen if", "when would you not". A question answerable by recalling one word is too shallow.
- Prefer transfer: set the idea in a fresh, concrete scenario different from the session, so the student must apply it, not repeat it.
- Target the misconception a student is most likely to hold about this topic.
- One question, one idea, under 40 words, plain language. Never reveal the answer in the question.
- Pick a concept the student has not just been asked about, so practice is spread across topics.

Reply with JSON only, no prose.`

// One teaching move per question, in turn, so practice climbs and varies.
const MOVES = [
  'Explain why: ask the student to explain the reasoning behind a choice made in the session.',
  'Predict: describe a small change or edge case and ask what would happen and why.',
  'Transfer: put the same idea in an unrelated domain and ask how it applies there.',
  'Compare: ask how this approach differs from a close alternative, and when each wins.',
  'Misconception: state a plausible but wrong belief about the idea and ask what is wrong with it.',
  'Teach it: ask the student to explain the idea to a junior developer in two sentences.',
]

const CHOICE_RULES = `For multiple choice: four options; the right one is listed first (it is shuffled later). Each wrong option is a misconception a real student holds, plausible to someone who half understands. All four have similar length, detail, and grammar, so length or tone never gives the answer away. No "all of the above" or "none of the above". The explanation says why the right one is right and what the most tempting wrong one gets wrong, in one or two sentences.`

// Asked in the same call as the question, so a source costs no extra request.
const SOURCE_RULE = `Optionally add "source": the one file the concept came from, copied exactly from a "tool ...: <path>" line in the session. Add ":<line>" only if the session itself shows that file with that line number. Leave "source" out if no file fits.`

// Sent only when the person has named topics. It never forces one the
// session did not cover, since a question about unseen work cannot be retrieved.
// The question stays on what the person is working on; a focus area only
// changes the angle, so "data science" still applies to a day of frontend work.
const FOCUS_RULE = `The student also wants to grow in these areas. Always ask about an idea from the session, never about a subject the session does not touch. If the session works on one of these areas directly, ask about that. Otherwise, if an idea from the session has a real, useful link to one of these areas, ask a question that carries the idea into that area: how the same idea shows up there, or what changes when it does. For example, a search box's debounce links to data science through batching a stream of events before a model sees them. Add "focus": that area, copied exactly from the list, and "bridge": a short phrase in that area's own words naming the setting the question uses (such as "batching events before a model"). The question itself must use that setting. If there is no honest link, ask as usual and leave "focus" and "bridge" out. Never force a link.`

// Every question names its concept, so the check-in can show what came up.
const TOPIC_RULE = `Also add "topic": the concept the question is about, in 2 to 4 plain words (such as "debouncing input").`

const NO_PREFS: TopicPrefs = { more: [], less: [] }

const GRADE_SYSTEM = `You are a kind, exact professor giving feedback on a student's short answer to a review question.
Open with one verdict word: "Solid.", "Partly." or "Not yet."
Then, in at most two short sentences: name what they got right, and name the specific gap or misconception (not a vague "add more detail").
End with the key idea in one plain sentence. Do not ask the student anything: they cannot reply.
At most 60 words in all. Plain text, no headings, no lists.`

// Asked for only after a miss, so the lesson aims at the one gap the
// feedback named instead of re-teaching the whole topic.
const LESSON_SYSTEM = `You are a kind, exact professor. Your student just missed part of a review question, and asked you to go deeper. You write a short micro-lesson on exactly the gap their answer shows, so they get it right next time.
First, the core idea in plain words: what is true, and why.
Then one concrete example that makes it click. Use a tiny code snippet only if it truly helps, at most 5 lines, on its own lines with no fences.
End with the one thing to remember, in one plain sentence that starts with "Remember:".
Do not repeat the question or the feedback. Do not ask the student anything: they cannot reply.
At most 120 words in all. Plain text, no headings, no lists, no markdown.`

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

type Digest = { text: string; paths: Set<string>; said: string }

async function digest($: Api): Promise<Digest> {
  const rows = await $.session.messages()
  const cwd = await $.session.cwd()
  const relative = (p: string) => (p.startsWith(cwd + '/') ? p.slice(cwd.length + 1) : p)
  const lines: string[] = []
  const paths = new Set<string>()
  const said: string[] = []
  for (const m of rows.slice(-40)) {
    // Redact before clipping, so a cut never leaves half a key behind.
    if (m.text.trim() !== '') lines.push(`${m.role}: ${clip(redact(m.text.trim()), 600)}`)
    said.push(m.text.split(cwd + '/').join(''))
    for (const t of m.toolUses) {
      const secret = t.input.file_path ?? t.input.path
      if (typeof secret === 'string' && isSecretPath(secret)) continue
      const file = t.input.file_path ?? t.input.notebook_path
      if (typeof file === 'string') paths.add(relative(file))
      const target = typeof file === 'string' ? relative(file) : (t.input.command ?? t.input.pattern ?? '')
      lines.push(`tool ${t.tool}: ${clip(redact(String(target)), 120)}`)
      // Grep -n output and the like cite `path:line` too.
      if (typeof t.text === 'string') said.push(t.text.split(cwd + '/').join(''))
    }
  }
  const text = lines.join('\n')
  return { text: text.length > CONTEXT_CHARS ? text.slice(-CONTEXT_CHARS) : text, paths, said: said.join('\n') }
}

// The model may name a file it never saw; show only paths the session touched,
// and a line number only when the session's own text cites it.
function checkSource(given: unknown, { paths, said }: Digest): string {
  if (typeof given !== 'string') return ''
  const [, path = '', line] = given.trim().match(/^(.+?)(?::(\d+))?$/) ?? []
  if (!paths.has(path)) return ''
  if (line === undefined) return path
  const cited = `${path}:${line}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Bounded, so `a.ts:17` is not verified by `a.ts:170` or `src/a.ts:17`.
  return new RegExp(`(^|[\\s\`'"(])${cited}(?!\\d)`, 'm').test(said) ? `${path}:${line}` : path
}

function parseJson(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return undefined
  }
}

type Completion = Awaited<ReturnType<Api['model']['complete']>>
const NO_USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

// A refused request rejects; treat it like any other unanswered call so the
// pane never stays stuck on a call that will not finish.
async function complete($: Api, request: Parameters<Api['model']['complete']>[0]): Promise<Completion> {
  try {
    return await $.model.complete(request)
  } catch {
    return { isAnswered: false, reason: 'empty-reply', usage: NO_USAGE }
  }
}

// There is no budget to stop at: spending is only counted, per session and
// per day, for the Settings view.
async function spend($: Api, r: { input_tokens: number; output_tokens: number }) {
  const n = r.input_tokens + r.output_tokens
  await update($, usage, u => ({ ...u, tokens: u.tokens + n }))
  // Reads the store fresh, so two sessions on one day both count.
  const days = ((await $.store.get('tokenLog')) ?? {}) as TokenLog
  const today = dayKey(new Date())
  const kept = Object.keys(days).sort().slice(-29)
  const next: TokenLog = Object.fromEntries(kept.map(d => [d, days[d] ?? 0]))
  next[today] = (next[today] ?? 0) + n
  await $.store.set('tokenLog', next)
  await update($, tokenLog, () => next)
}

const yesterday = () => {
  const d = new Date()
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))
}

// A streak stays alive until a whole day passes with no answer.
const liveStreak = (t: QuizStats) => (t.lastDay === dayKey(new Date()) || t.lastDay === yesterday() ? t.streak : 0)

const verdictOf = (feedback: string): Verdict | undefined => {
  const word = feedback.trim().toLowerCase()
  if (word.startsWith('solid')) return 'solid'
  if (word.startsWith('partly')) return 'partly'
  if (word.startsWith('not yet')) return 'notYet'
  return undefined
}

// Reads the store fresh, so two sessions answering on one day both count.
async function recordAnswer($: Api, verdict: Verdict | undefined): Promise<QuizStats> {
  const t: QuizStats = { ...NO_STATS, ...((await $.store.get('stats')) as Partial<QuizStats> | undefined) }
  const today = dayKey(new Date())
  const streak = t.lastDay === today ? t.streak : t.lastDay === yesterday() ? t.streak + 1 : 1
  const next: QuizStats = {
    ...t,
    answered: t.answered + 1,
    ...(verdict === undefined ? {} : { [verdict]: t[verdict] + 1 }),
    streak,
    best: Math.max(t.best, streak),
    lastDay: today,
  }
  await $.store.set('stats', next)
  await update($, stats, () => next)
  return next
}

// The log lives in files, not in the plugin's store: in a top-level folder of
// the project being worked on, so notes sit next to the work they came from.
const NOTES_DIR = 'learning-galore-notes'
const learningDir = async ($: Api): Promise<string> => `${await $.session.cwd()}/${NOTES_DIR}`

async function logAnswer($: Api, q: Quiz, verdict: Verdict | undefined) {
  try {
    await writeLog($, q, verdict)
  } catch {
    // A refused read or write must never break the quiz itself.
  }
}

async function writeLog($: Api, q: Quiz, verdict: Verdict | undefined) {
  const dir = await learningDir($)
  const data = `${dir}/answers.json`
  let log: LogRecord[] = []
  try {
    const text = await $.fs.read(data)
    if (typeof text === 'string') log = JSON.parse(text) as LogRecord[]
  } catch {
    // No file yet: the first answer starts it.
  }
  // An earlier version kept the log in the store; move it out once.
  const old = await $.store.get('log')
  if (Array.isArray(old)) {
    log = [...(old as LogRecord[]), ...log]
    await $.store.delete('log')
  }
  log = appendRecord(log, buildRecord(q, verdict, dayKey(new Date())))
  await $.fs.write(data, JSON.stringify(log))
  await $.fs.write(`${dir}/review.md`, toMarkdown(log))
  await $.fs.write(`${dir}/anki/session-quiz.tsv`, toAnki(log))
}

function statsSummary(t: QuizStats): string {
  if (t.answered === 0) return 'No quiz answers yet. Answer a question to start a streak.'
  const pct = (n: number) => `${Math.round((n / t.answered) * 100)}%`
  return [
    `Answered ${t.answered}.`,
    `Solid ${t.solid} (${pct(t.solid)}), Partly ${t.partly} (${pct(t.partly)}), Not yet ${t.notYet} (${pct(t.notYet)}).`,
    `Current streak ${liveStreak(t)} ${liveStreak(t) === 1 ? 'day' : 'days'}, best ${t.best}.`,
  ].join(' ')
}

const savedFocus = async ($: Api): Promise<string[]> => {
  const saved = await $.store.get('focus')
  return Array.isArray(saved) ? saved.filter((t): t is string => typeof t === 'string') : []
}

const savedPrefs = async ($: Api): Promise<TopicPrefs> => ({
  ...NO_PREFS,
  ...((await $.store.get('topicPrefs')) as Partial<TopicPrefs> | undefined),
})

// Tallies what each answered question was about; every CHECKIN_EVERY answers
// the pane asks whether to see more or less of those topics.
async function noteTopic($: Api, t: QuizStats) {
  const q: Quiz = await read($, quiz)
  const tally = tallyTopic(((await $.store.get('topicTally')) ?? {}) as Record<string, number>, q.topic)
  await $.store.set('topicTally', tally)
  if (t.answered % CHECKIN_EVERY === 0 && topTopics(tally).length > 0) await update($, checkin, () => true)
}

async function saveCheckin($: Api) {
  const chosen: Record<string, Pick> = await read($, picks)
  await $.store.set('topicPrefs', applyPicks(await savedPrefs($), chosen))
  await $.store.set('topicTally', {})
  await update($, picks, () => ({}))
  await update($, checkin, () => false)
}

const openPane = ($: Api) => $.ui.open({ id: PANE, title: 'Quiz' })

async function askQuestion($: Api) {
  const current: Quiz = await read($, quiz)
  if (current.status === 'thinking' || current.status === 'grading' || current.status === 'teaching') return
  if (await askReview($)) return
  const session = await digest($)
  const context = session.text
  if (context.length < 200) {
    await update($, quiz, (): Quiz => ({ ...EMPTY, status: 'error', error: 'Not enough session to ask about yet. A question comes once Claude has replied.' }))
    return
  }
  const { format }: QuizSettings = await read($, settings)
  await update($, quiz, (): Quiz => ({ ...EMPTY, status: 'thinking', format }))
  $.ui.status(undefined)

  const previous: string[] = await read($, asked)
  const move = MOVES[previous.length % MOVES.length]
  const topics = await savedFocus($)
  const focusField = topics.length > 0 ? ', "focus": "...", "bridge": "..."' : ''
  const shape =
    format === 'choice'
      ? `${CHOICE_RULES}\n${SOURCE_RULE}\n${TOPIC_RULE}\nReply as {"question": "...", "choices": ["right", "wrong", "wrong", "wrong"], "explanation": "...", "source": "...", "topic": "..."${focusField}}`
      : `${SOURCE_RULE}\n${TOPIC_RULE}\nReply as {"question": "...", "source": "...", "topic": "..."${focusField}}`
  const prefs = await savedPrefs($)
  const steer = [
    prefs.more.length > 0 ? `The student asked for more questions about: ${prefs.more.join(', ')}.` : '',
    prefs.less.length > 0 ? `The student asked for fewer questions about: ${prefs.less.join(', ')}. Pick another idea when the session offers one.` : '',
  ].filter(Boolean).join('\n')
  const focus =
    (topics.length > 0 ? `Areas the student wants to grow in:\n${topics.join('\n')}\n${FOCUS_RULE}\n\n` : '') +
    (steer !== '' ? `${steer}\n\n` : '')
  const prompt = `Recent session:\n<session>\n${context}\n</session>\n\nAlready asked (pick a different concept or angle):\n${previous.slice(-10).join('\n') || '(none)'}\n\nTeaching move for this question: ${move}\n\n${focus}${shape}`

  const r = await complete($, {
    model: MODEL,
    system: ASK_SYSTEM,
    prompt,
    maxTokens: ASK_MAX_TOKENS,
    effort: 'low',
    timeoutMs: 30000,
  })
  await spend($, r.usage)
  const data = r.isAnswered ? parseJson(r.text) : undefined
  const question = typeof data?.question === 'string' ? data.question : ''
  if (question === '') {
    await update($, quiz, (q): Quiz => ({ ...q, status: 'error', error: 'Could not make a question this time.' }))
    return
  }
  const given = Array.isArray(data?.choices) ? data.choices.map(String).slice(0, 4) : []
  const isChoice = format === 'choice' && given.length >= 2
  // Models put the right answer in the same slot too often; shuffle here.
  const order = given.map((_, i) => i).sort(() => Math.random() - 0.5)
  const choices = order.map(i => given[i] ?? '')
  await update($, asked, list => [...list, question].slice(-30))
  await update($, usage, u => ({ ...u, questions: u.questions + 1 }))
  await update($, quiz, (q): Quiz => ({
    ...q,
    status: 'asking',
    format: isChoice ? 'choice' : 'free',
    question,
    choices: isChoice ? choices : [],
    correct: isChoice ? order.indexOf(0) : -1,
    explanation: typeof data?.explanation === 'string' ? data.explanation : '',
    source: checkSource(data?.source, session),
    focus: checkLink(data?.focus, data?.bridge, question, topics),
    topic: typeof data?.topic === 'string' ? data.topic : '',
  }))
  $.ui.status('A quiz question is waiting')
  // Takes the keyboard only over an empty prompt, so it never interrupts typing.
  void $.ui.open({ id: PANE, title: 'Quiz', focus: true })
}

// Read from the session's clock, so a test can move the day forward.
const reviewDay = async ($: Api) => dayKey(new Date(await $.clock.now()))
const loadQueue = async ($: Api) => ((await $.store.get('review')) as ReviewItem[] | undefined) ?? []

// A due review item needs no model call to ask; free text is still graded.
// Answers true when it asked one.
async function askReview($: Api): Promise<boolean> {
  const item = pickDue(await loadQueue($), await reviewDay($))
  if (item === undefined) return false
  const isChoice = item.format === 'choice' && item.choices.length >= 2
  const order = item.choices.map((_, i) => i).sort(() => Math.random() - 0.5)
  await update($, asked, list => [...list, item.question].slice(-30))
  await update($, usage, u => ({ ...u, questions: u.questions + 1 }))
  await update($, quiz, (): Quiz => ({
    ...EMPTY,
    status: 'asking',
    format: isChoice ? 'choice' : 'free',
    question: item.question,
    choices: isChoice ? order.map(i => item.choices[i] ?? '') : [],
    correct: isChoice ? order.indexOf(0) : -1,
    explanation: item.explanation,
    source: item.source,
    reviewFrom: item.added,
  }))
  $.ui.status('A quiz review question is waiting')
  void $.ui.open({ id: PANE, title: 'Quiz', focus: true })
  return true
}

// Reads the store fresh, like recordAnswer, so two sessions do not drop each other's items.
async function recordReview($: Api, q: Quiz, verdict: Verdict) {
  const queue = await loadQueue($)
  const today = await reviewDay($)
  // The right choice goes first, as the model wrote it, so a later ask can shuffle again.
  const right = q.choices[q.correct]
  const choices = right === undefined ? [] : [right, ...q.choices.filter((_, i) => i !== q.correct)]
  const fresh: ReviewItem = {
    question: q.question,
    format: q.format,
    choices,
    explanation: q.explanation,
    source: q.source,
    added: today,
    interval: 0,
    due: today,
  }
  const saved = queue.find(r => r.question === q.question)
  const next = schedule(saved ?? fresh, verdict, today)
  // A new question answered well leaves nothing to save.
  if (saved === undefined && next === undefined) return
  await $.store.set('review', upsert(queue, q.question, next))
}

// A skipped review item comes back tomorrow, not on the very next question.
async function skip($: Api) {
  const q: Quiz = await read($, quiz)
  await update($, quiz, (cur): Quiz => ({ ...cur, status: 'idle' }))
  if (q.reviewFrom === '') return
  const queue = await loadQueue($)
  const item = queue.find(r => r.question === q.question)
  if (item !== undefined) await $.store.set('review', upsert(queue, q.question, { ...item, due: addDays(await reviewDay($), 1) }))
}

function reviewSummary(queue: ReviewItem[], today: string): string {
  const due = dueItems(queue, today).length
  const next = queue.filter(r => r.due > today).map(r => r.due).sort()[0]
  return `${due} review ${due === 1 ? 'question' : 'questions'} due, ${queue.length} queued.${due === 0 && next !== undefined ? ` Next due ${next}.` : ''}`
}

async function gradeFree($: Api, answer: string) {
  const q: Quiz = await read($, quiz)
  if (q.status !== 'asking' || answer.trim() === '') return
  await update($, quiz, (cur): Quiz => ({ ...cur, status: 'grading', answer }))
  const r = await complete($, {
    model: MODEL,
    system: GRADE_SYSTEM,
    prompt: `Question: ${q.question}\n\nAnswer: ${answer.slice(0, ANSWER_CHARS)}`,
    maxTokens: GRADE_MAX_TOKENS,
    effort: 'low',
    timeoutMs: 30000,
  })
  await spend($, r.usage)
  await update($, quiz, (cur): Quiz => ({
    ...cur,
    status: 'answered',
    feedback: r.isAnswered ? r.text.trim() : 'Could not grade this one, but thanks for answering.',
  }))
  // An ungraded answer still counts toward the streak, with no verdict.
  const verdict = r.isAnswered ? verdictOf(r.text) : undefined
  const t = await recordAnswer($, verdict)
  if (verdict !== undefined) await recordReview($, await read($, quiz), verdict)
  await logAnswer($, await read($, quiz), verdict)
  await noteTopic($, t)
  $.ui.status(undefined)
}

const selectChoice = ($: Api, index: number) =>
  update($, quiz, (cur): Quiz => (cur.status === 'asking' ? { ...cur, selected: index } : cur))

async function submitChoice($: Api) {
  let verdict: Verdict | undefined
  const done = await update($, quiz, (cur): Quiz => {
    const index = cur.selected
    if (cur.status !== 'asking' || index < 0) return cur
    const isRight = index === cur.correct
    verdict = isRight ? 'solid' : 'notYet'
    const right = cur.choices[cur.correct] ?? ''
    return {
      ...cur,
      status: 'answered',
      answer: cur.choices[index] ?? '',
      feedback: `${isRight ? 'Solid.' : `Not yet. The answer is: ${/[.!?]$/.test(right) ? right : `${right}.`}`} ${cur.explanation}`.trim(),
    }
  })
  // Unset when the press found no question to answer, so a repeat press never counts twice.
  if (verdict === undefined) return
  const t = await recordAnswer($, verdict)
  await recordReview($, done, verdict)
  await logAnswer($, done, verdict)
  await noteTopic($, t)
  $.ui.status(undefined)
}

// "Partly." and "Not yet." are the verdicts GRADE_SYSTEM opens with; a wrong
// pick is a miss outright.
const isMiss = (q: Quiz) =>
  q.format === 'choice' ? q.selected !== q.correct : /^(Partly|Not yet)\b/.test(q.feedback)

async function goDeeper($: Api) {
  const q: Quiz = await read($, quiz)
  if (q.status !== 'answered' || !isMiss(q)) return
  await update($, quiz, (cur): Quiz => ({ ...cur, status: 'teaching', lesson: '', error: '' }))
  const right = q.format === 'choice' ? `\n\nRight answer: ${q.choices[q.correct] ?? ''}` : ''
  const r = await complete($, {
    model: MODEL,
    system: LESSON_SYSTEM,
    prompt: `Question: ${q.question}\n\nStudent's answer: ${q.answer.slice(0, ANSWER_CHARS)}${right}\n\nFeedback they got: ${q.feedback}`,
    maxTokens: LESSON_MAX_TOKENS,
    effort: 'low',
    timeoutMs: 30000,
  })
  await spend($, r.usage)
  await update($, quiz, (cur): Quiz => ({
    ...cur,
    status: 'taught',
    lesson: r.isAnswered ? r.text.trim() : '',
    error: r.isAnswered ? '' : 'Could not write a lesson this time.',
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quiz',
      description: 'Open the Quiz pane. Args: now | review | focus <areas> | topics | settings | stats | log | free | choice',
    })
    const saved = await $.store.get('settings')
    if (saved !== undefined) await update($, settings, () => ({ ...DEFAULTS, ...(saved as Partial<QuizSettings>) }))
    const savedTokens = await $.store.get('tokenLog')
    if (savedTokens !== undefined) await update($, tokenLog, () => savedTokens as TokenLog)
    const savedStats = await $.store.get('stats')
    if (savedStats !== undefined) await update($, stats, () => ({ ...NO_STATS, ...(savedStats as Partial<QuizStats>) }))
    $.ui.status(undefined)
    // A reload drops any model call in flight; state survives it, so settle
    // whatever that call left waiting.
    await update($, quiz, (q): Quiz =>
      q.status === 'thinking'
        ? { ...q, status: 'idle' }
        : q.status === 'grading'
          ? { ...q, status: 'asking' }
          : q.status === 'teaching'
            ? { ...q, status: 'answered' }
            : q,
    )
    void openPane($)

    return next(e)
  })

  // Claude starts working: that's the idle window, so ask a question then.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const q: Quiz = await read($, quiz)
    if (q.status === 'idle' || q.status === 'answered' || q.status === 'taught' || q.status === 'error') {
      $.clock.after(0, () => void askQuestion($))
    }

    return next(e)
  })

  on('command.run', { command: 'quiz' }, async ($, e) => {
    const [word = ''] = e.args.trim().split(/\s+/)
    const save = async (fn: (s: QuizSettings) => QuizSettings) => {
      const s = await update($, settings, fn)
      await $.store.set('settings', s)
      return s
    }
    await openPane($)
    if (word === 'free' || word === 'choice') {
      await save(s => ({ ...s, format: word as Format }))
      return { text: `Quiz format: ${word === 'free' ? 'free text' : 'multiple choice'}.` }
    }
    if (word === 'settings') {
      await update($, showSettings, () => true)
      return { text: 'Quiz settings opened in the pane.' }
    }
    if (word === 'stats') {
      const t: QuizStats = { ...NO_STATS, ...((await $.store.get('stats')) as Partial<QuizStats> | undefined) }
      return { text: statsSummary(t) }
    }
    if (word === 'log') {
      const dir = await learningDir($)
      return { text: `Your review is in ${dir}/review.md. Anki cards are in ${dir}/anki/session-quiz.tsv; import that file in Anki.` }
    }
    if (word === 'review') {
      const queue = await loadQueue($)
      const today = await reviewDay($)
      const q: Quiz = await read($, quiz)
      const isBusy = q.status === 'thinking' || q.status === 'grading' || q.status === 'teaching'
      if (isBusy || pickDue(queue, today) === undefined) return { text: reviewSummary(queue, today) }
      // A review needs no model call, so it is ready before the reply.
      await askQuestion($)
      return { text: `${reviewSummary(queue, today)} Asking the most overdue.` }
    }
    if (word === 'topics') {
      await update($, checkin, () => true)
      return { text: 'Topic check-in opened in the pane.' }
    }
    if (word === 'focus') {
      const rest = e.args.trim().slice(word.length).trim()
      if (rest === '') {
        const topics = await savedFocus($)
        return {
          text: topics.length === 0
            ? 'No focus topics. Add some with /quiz focus <topic>, <topic>.'
            : `Focus topics: ${topics.join(', ')}.`,
        }
      }
      if (rest === 'clear') {
        await $.store.delete('focus')
        return { text: 'Focus topics cleared.' }
      }
      const topics = parseFocus(rest)
      if (topics.length === 0) return { text: 'Usage: /quiz focus <topic>, <topic>' }
      await $.store.set('focus', topics.slice(0, FOCUS_MAX))
      const dropped = topics.length > FOCUS_MAX ? ` Kept the first ${FOCUS_MAX}.` : ''
      return { text: `Focus topics: ${topics.slice(0, FOCUS_MAX).join(', ')}.${dropped}` }
    }
    if (word === 'now') {
      void askQuestion($)
      return { text: 'Making a question.' }
    }
    return { text: 'Quiz pane opened. Run /quiz settings to see token use.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // Mobile draws no text fields.
    const Input = 'Input' in els ? els.Input : undefined
    const toggleFormat = () =>
      void update($, settings, (cur): QuizSettings => ({
        ...cur,
        format: cur.format === 'free' ? 'choice' : 'free',
      })).then(saved => $.store.set('settings', saved))
    const q: Quiz = await read($, quiz)
    const u: QuizUsage = await read($, usage)
    const s: QuizSettings = await read($, settings)
    const t: QuizStats = await read($, stats)
    const days: TokenLog = await read($, tokenLog)
    const isSettings: boolean = await read($, showSettings)
    const setSettings = (open: boolean) => void update($, showSettings, () => open)

    // While a model call runs the pane holds no control, so the Enter that
    // submitted an answer has nothing to land on.
    // The field's text area: the pane width less the border, padding and hint.
    const fieldWidth = Math.max(0, e.props.bodyColumns - 10)
    const isAnswered = q.status === 'answered' || q.status === 'teaching' || q.status === 'taught'
    const isBusy = q.status === 'thinking' || q.status === 'grading' || q.status === 'teaching'
    // `claude` is the theme's own accent, so the pane follows the person's theme.
    const ACCENT = 'claude'
    const header = (
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={ACCENT}>Quiz</Text>
        <Text dimColor>{isSettings ? 'settings' : 'while Claude works'}</Text>
      </Box>
    )
    const footer = (
      <Box flexDirection="column" marginTop={1}>
        {!isBusy && (
          <Box gap={2}>
            <Button key="format" hotkey="f" plain onPress={toggleFormat}>
              Format <Text color={ACCENT}>{s.format === 'free' ? 'free text' : 'multiple choice'}</Text>
            </Button>
            <Button key="settings" hotkey="g" plain onPress={() => setSettings(true)}>
              Settings
            </Button>
          </Box>
        )}
        {!e.props.isFocused && <Text dimColor>ctrl+x tab to answer here</Text>}
      </Box>
    )
    const frame = (...body: RenderChildren[]) => (
      <Box flexDirection="column">
        {header}
        {body}
        {footer}
      </Box>
    )

    // Numbers live here only, so the quiz itself stays about the ideas.
    if (isSettings) {
      const today = dayKey(new Date())
      const recent = Object.keys(days).sort().reverse().slice(0, 7)
      const fmt = (n: number) => n.toLocaleString('en-US')
      return (
        <Box flexDirection="column">
          {header}
          <Button key="settings-format" hotkey="f" plain onPress={toggleFormat}>
            Format <Text color={ACCENT}>{s.format === 'free' ? 'free text' : 'multiple choice'}</Text>
          </Button>
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Tokens used</Text>
            <Text>Today: {fmt(days[today] ?? 0)}</Text>
            <Text>This session: {fmt(u.tokens)} over {u.questions} {u.questions === 1 ? 'question' : 'questions'}</Text>
            {recent.filter(d => d !== today).map(d => (
              <Text dimColor>
                {d}: {fmt(days[d] ?? 0)}
              </Text>
            ))}
          </Box>
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Answers</Text>
            <Text>{statsSummary(t)}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>There is no limit. The quiz never stops you.</Text>
          </Box>
          <Box marginTop={1}>
            <Button key="back" hotkey="b" variant="primary" onPress={() => setSettings(false)}>
              Back to the quiz
            </Button>
          </Box>
        </Box>
      )
    }

    const isCheckin: boolean = await read($, checkin)
    if (isCheckin && !isBusy) {
      const tally = ((await $.store.get('topicTally')) ?? {}) as Record<string, number>
      const chosen: Record<string, Pick> = await read($, picks)
      const choose = (topic: string, pick: Pick) =>
        void update($, picks, cur => {
          const next = { ...cur }
          // Pressing the same choice again clears it.
          if (next[topic] === pick) delete next[topic]
          else next[topic] = pick
          return next
        })
      return frame(
        <Text bold>Topic check-in</Text>,
        <Text dimColor>These came up most since the last check-in. Want more or less of them?</Text>,
        topTopics(tally).length === 0 && <Text dimColor>No topics yet. Answer a few questions first.</Text>,
        <Box flexDirection="column" marginTop={1}>
          {topTopics(tally).map((topic, i) => (
            <Box key={`topic-${i}`} gap={2}>
              <Button key={`more-${i}`} plain onPress={() => choose(topic, 'more')}>
                {chosen[topic] === 'more' ? <Text color={ACCENT} bold>[ More ]</Text> : <Text>[ More ]</Text>}
              </Button>
              <Button key={`less-${i}`} plain onPress={() => choose(topic, 'less')}>
                {chosen[topic] === 'less' ? <Text color={ACCENT} bold>[ Less ]</Text> : <Text>[ Less ]</Text>}
              </Button>
              <Text>{topic}</Text>
            </Box>
          ))}
        </Box>,
        <Box marginTop={1} gap={2}>
          <Button key="checkin-save" hotkey="v" variant="primary" onPress={() => void saveCheckin($)}>
            Save
          </Button>
          <Button key="checkin-later" onPress={() => void update($, checkin, () => false)}>
            Not now
          </Button>
        </Box>,
      )
    }

    if (q.status === 'idle') {
      return frame(
        <Text dimColor>A question will show up here while Claude works.</Text>,
        <Button key="now" hotkey="n" variant="primary" onPress={() => void askQuestion($)}>Ask me now</Button>,
      )
    }
    if (q.status === 'thinking') return frame(<Text dimColor>Thinking of a question…</Text>)
    if (q.status === 'error') {
      return frame(
        <Text dimColor>{q.error}</Text>,
        <Button key="retry" hotkey="n" variant="primary" onPress={() => void askQuestion($)}>Try again</Button>,
      )
    }

    return frame(
      <Text bold>{q.question}</Text>,
      q.source !== '' && <Text dimColor>From: {q.source}</Text>,
      q.reviewFrom !== '' && <Text dimColor>Review from {q.reviewFrom}</Text>,
      q.focus !== '' && <Text dimColor>Linked to: {q.focus}</Text>,
      q.status === 'asking' && q.format === 'choice' && (
        <Box flexDirection="column" marginTop={1}>
          {q.choices.map((c, i) => (
            <Button key={`choice-${i}`} hotkey={String(i + 1)} plain onPress={() => void selectChoice($, i)}>
              {q.selected === i ? <Text color={ACCENT} bold>(•) {c}</Text> : <Text>( ) {c}</Text>}
            </Button>
          ))}
        </Box>
      ),
      q.status === 'asking' && q.format === 'free' && Input === undefined && (
        <Text dimColor>Free-text answers need the terminal or desktop app.</Text>
      ),
      q.status === 'asking' && q.format === 'free' && Input !== undefined && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Your answer</Text>
          <Box borderStyle="round" borderColor={ACCENT} paddingX={1}>
            <Input
              // A new key per question gives each one an empty field.
              key={`answer-${u.questions}`}
              placeholder="Type your answer"
              rows={1}
              autoFocus
              submitLabel=""
              value={q.draft}
              onInput={(value: string) =>
                void update($, quiz, (cur): Quiz => ({ ...cur, draft: value.slice(0, ANSWER_CHARS) }))
              }
              onSubmit={(value: string) => void gradeFree($, value.slice(0, ANSWER_CHARS))}
            />
          </Box>
          {/* The field scrolls a long line sideways; show the whole answer wrapped. */}
          {q.draft.length > fieldWidth && <Text dimColor>{q.draft}</Text>}
          {q.draft.length >= ANSWER_CHARS && <Text dimColor>That is as long as an answer can be. Keep it short.</Text>}
        </Box>
      ),
      q.status === 'grading' && <Text dimColor>Checking your answer…</Text>,
      isAnswered && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>
            {q.format === 'free' ? 'You said' : 'You picked'}: {clip(q.answer, 300)}
          </Text>
          <Text>{q.feedback}</Text>
        </Box>
      ),
      q.status === 'teaching' && (
        <Box marginTop={1}>
          <Text dimColor>Writing a short lesson…</Text>
        </Box>
      ),
      q.status === 'taught' && (
        <Box marginTop={1}>
          {q.lesson !== '' ? <Text>{q.lesson}</Text> : <Text dimColor>{q.error}</Text>}
        </Box>
      ),
      <Box marginTop={1} gap={2}>
        {q.status === 'asking' && q.format === 'free' && Input !== undefined && (
          <Button key="send" variant="primary" onPress={() => void gradeFree($, q.draft)}>
            {q.draft.trim() === '' ? 'Type an answer' : 'Submit'}
          </Button>
        )}
        {q.status === 'asking' && q.format === 'choice' && (
          <Button key="submit" hotkey="a" variant="primary" onPress={() => void submitChoice($)}>
            {q.selected < 0 ? 'Pick an answer' : 'Submit'}
              {q.selected < 0 ? '' : <Text dimColor> a</Text>}
          </Button>
        )}
        {q.status === 'asking' && (
          <Button key="skip" hotkey="s" onPress={() => void skip($)}>
            Skip <Text dimColor>s</Text>
          </Button>
        )}
        {(q.status === 'answered' || q.status === 'taught') && (
          <Button key="next" hotkey="n" variant="primary" onPress={() => void askQuestion($)}>Next question</Button>
        )}
        {q.status === 'answered' && isMiss(q) && (
          <Button key="deeper" hotkey="d" onPress={() => void goDeeper($)}>
            Go deeper <Text dimColor>d</Text>
          </Button>
        )}
      </Box>,
    )
  })
}

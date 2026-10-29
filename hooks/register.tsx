import { atom, read, update } from 'claude-code'
import type { EngineInterface as Api, Register } from 'claude-code'

import type { Format, Note, Quiz, Verdict } from '../types'
import { checkLink, parseFocus } from './focus'
import { appendNote, buildNote, toMarkdown } from './notes'
import { isSecretPath, redact } from './redact'

const PANE = 'session-quiz'
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
  focus: '',
  term: '',
  definition: '',
}

const quiz = atom({ plugin: 'session-quiz', key: 'quiz' } as const, EMPTY, { shape: 'quiz-mvp-2' })
const format = atom({ plugin: 'session-quiz', key: 'format' } as const, 'free', { shape: 'format-1' })
const asked = atom({ plugin: 'session-quiz', key: 'asked' } as const, [], { shape: 'asked-1' })
const showSettings = atom({ plugin: 'session-quiz', key: 'showSettings' } as const, false, { shape: 'show-settings-1' })
const sessionTokens = atom({ plugin: 'session-quiz', key: 'sessionTokens' } as const, 0, { shape: 'session-tokens-1' })
const petStep = atom({ plugin: 'session-quiz', key: 'petStep' } as const, 0, { shape: 'pet-step-1' })

// A cat that walks back and forth along the bottom of the pane. It faces the
// way it walks (tail behind it) and wags its tail every other step.
const CAT_TOP = ' /\\_/\\ '
const catBody = (right: boolean, wag: boolean) =>
  right ? `${wag ? '~' : '-'}( o.o )` : `( o.o )${wag ? '~' : '-'}`
const CAT_WIDTH = 8

function petAt(step: number, track: number): { x: number; right: boolean } {
  if (track <= 0) return { x: 0, right: true }
  const p = step % (2 * track)
  return p < track ? { x: p, right: true } : { x: 2 * track - p, right: false }
}

// A model call in flight in each busy state, and where a reload that dropped it settles.
const BUSY = { thinking: 'idle', grading: 'asking', teaching: 'answered' } as const
const isBusy = (status: Quiz['status']): status is keyof typeof BUSY => status in BUSY

// How a good lecturer would review the session: retrieval practice, rotated
// through Bloom's levels, asking for reasons and transfer rather than recall.
const ASK_SYSTEM = `You are a professor who teaches software engineering well. Your student is a developer who just worked through the session below with a coding assistant. You write one review question that makes them retrieve and reason about the ideas behind that work, so they keep it.

How you teach:
- Build the question around one key concept behind what the developer is building: an idea from systems design, architecture or engineering practice that they should understand while they build, such as debounce, idempotency, a composite index, cache invalidation or a message queue. Ask what it means and why it matters in what they are building, in their own words.
- Ask only about the big, central ideas of the session: the concepts a senior engineer would want the student to still know in a year. Skip small details, syntax, configuration, and trivia (file names, exact code, what the assistant said).
- The question must be answerable from understanding alone, in one or two sentences (under ${ANSWER_CHARS} characters). If an idea needs a long essay, ask about one part of it.
- Ask for reasons: "why", "how", "what would happen if", "when would you not". A question answerable by recalling one word is too shallow.
- Prefer transfer: set the idea in a fresh, concrete scenario different from the session, so the student must apply it, not repeat it.
- Target the misconception a student is most likely to hold about this topic.
- One question, one idea, under 40 words, plain language. Never reveal the answer in the question.
- Pick a concept the student has not just been asked about, so practice is spread across topics.

Reply with JSON only, no prose.`

const MOVES = [
  'Explain why: ask the student to explain the reasoning behind a choice made in the session.',
  'Predict: describe a small change or edge case and ask what would happen and why.',
  'Transfer: put the same idea in an unrelated domain and ask how it applies there.',
  'Compare: ask how this approach differs from a close alternative, and when each wins.',
  'Misconception: state a plausible but wrong belief about the idea and ask what is wrong with it.',
  'Teach it: ask the student to explain the idea to a junior developer in two sentences.',
]

const CHOICE_RULES = `For multiple choice: four options; the right one is listed first (it is shuffled later). Each wrong option is a misconception a real student holds, plausible to someone who half understands. All four have similar length, detail, and grammar, so length or tone never gives the answer away. No "all of the above" or "none of the above". The explanation says why the right one is right and what the most tempting wrong one gets wrong, in one or two sentences.`

const SOURCE_RULE = `Optionally add "source": the one file the concept came from, copied exactly from a "tool ...: <path>" line in the session. Add ":<line>" only if the session itself shows that file with that line number. Leave "source" out if no file fits.`

// A focus area only changes the angle, so "data science" still applies to a
// day of frontend work.
const FOCUS_RULE = `The student also wants to grow in these areas. Always ask about an idea from the session, never about a subject the session does not touch. If the session works on one of these areas directly, ask about that. Otherwise, if an idea from the session has a real, useful link to one of these areas, ask a question that carries the idea into that area: how the same idea shows up there, or what changes when it does. For example, a search box's debounce links to data science through batching a stream of events before a model sees them. Add "focus": that area, copied exactly from the list, and "bridge": a short phrase in that area's own words naming the setting the question uses (such as "batching events before a model"). The question itself must use that setting. If there is no honest link, ask as usual and leave "focus" and "bridge" out. Never force a link.`

const TERM_RULE = `Also add "term": that key concept, named in 1 to 4 words as an engineer would name it (such as "debounce" or "event-driven architecture"), and "definition": what it means, in one plain sentence.`

const GRADE_SYSTEM = `You are a kind, exact professor giving feedback on a student's short answer to a review question.
Open with one verdict word: "Solid.", "Partly." or "Not yet."
Then, in at most two short sentences: name what they got right, and name the specific gap or misconception (not a vague "add more detail").
End with the key idea in one plain sentence. Do not ask the student anything: they cannot reply.
At most 60 words in all. Plain text, no headings, no lists.`

const LESSON_SYSTEM = `You are a kind, exact professor. Your student just missed part of a review question, and asked you to go deeper. You write a short micro-lesson on exactly the gap their answer shows, so they get it right next time.
First, the core idea in plain words: what is true, and why.
Then one concrete example that makes it click. Use a tiny code snippet only if it truly helps, at most 5 lines, on its own lines with no fences.
End with the one thing to remember, in one plain sentence that starts with "Remember:".
Do not repeat the question or the feedback. Do not ask the student anything: they cannot reply.
At most 120 words in all. Plain text, no headings, no lists, no markdown.`

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

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
  return { text: text.slice(-CONTEXT_CHARS), paths, said: said.join('\n') }
}

// The model may name a file it never saw; show only paths the session touched,
// and a line number only when the session's own text cites it.
function checkSource(given: unknown, { paths, said }: Digest): string {
  const [, path = '', line] = str(given).trim().match(/^(.+?)(?::(\d+))?$/) ?? []
  if (!paths.has(path)) return ''
  if (line === undefined) return path
  const cited = `${path}:${line}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Bounded, so `a.ts:17` is not verified by `a.ts:170` or `src/a.ts:17`.
  return new RegExp(`(^|[\\s\`'"(])${cited}(?!\\d)`, 'm').test(said) ? `${path}:${line}` : path
}

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  } catch {
    return undefined
  }
}

// The person's local date, so a day ends at their midnight, not UTC's.
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type Today = { day: string; tokens: number }

const tokensToday = async ($: Api): Promise<number> => {
  const saved = (await $.store.get('tokensToday')) as Today | undefined
  return saved?.day === dayKey(new Date()) ? saved.tokens : 0
}

// Undefined when the call was refused or went unanswered, so the pane never
// stays stuck on a call that will not finish.
async function haiku($: Api, system: string, prompt: string, maxTokens: number): Promise<string | undefined> {
  try {
    const r = await $.model.complete({ model: 'haiku', system, prompt, maxTokens, effort: 'low', timeoutMs: 30000 })
    const n = r.usage.input_tokens + r.usage.output_tokens
    await update($, sessionTokens, t => t + n)
    // Read fresh, so two sessions on one day both count.
    await $.store.set('tokensToday', { day: dayKey(new Date()), tokens: (await tokensToday($)) + n } satisfies Today)
    return r.isAnswered ? r.text.trim() : undefined
  } catch {
    return undefined
  }
}

const notesDir = async ($: Api) => `${await $.session.cwd()}/learning-galore-notes`

// A missing file starts a fresh list, and a refused write never breaks the quiz.
async function saveNote($: Api, q: Quiz) {
  try {
    const dir = await notesDir($)
    let notes: Note[] = []
    try {
      notes = JSON.parse(await $.fs.read(`${dir}/answers.json`)) as Note[]
    } catch {}
    notes = appendNote(notes, buildNote(q, dayKey(new Date())))
    await $.fs.write(`${dir}/answers.json`, JSON.stringify(notes))
    await $.fs.write(`${dir}/notes.md`, toMarkdown(notes))
  } catch {}
}

const savedFocus = async ($: Api): Promise<string[]> => {
  const saved = await $.store.get('focus')
  return Array.isArray(saved) ? saved.filter((t): t is string => typeof t === 'string') : []
}

const openPane = ($: Api, focus?: true) => $.ui.open({ id: PANE, title: 'Quiz', focus })

const setFormat = async ($: Api, fn: (f: Format) => Format) => $.store.set('format', await update($, format, fn))

async function askQuestion($: Api) {
  if (isBusy((await read($, quiz)).status)) return
  // Unlimited unless the person set a daily cap with /quiz limit.
  const limit = await $.store.get('dailyLimit')
  if (typeof limit === 'number' && (await tokensToday($)) >= limit) {
    await update($, quiz, (): Quiz => ({ ...EMPTY, status: 'error', error: `You reached today's limit of ${limit.toLocaleString('en-US')} tokens. Run /quiz limit off to remove it.` }))
    return
  }
  const session = await digest($)
  if (session.text.length < 200) {
    await update($, quiz, (): Quiz => ({ ...EMPTY, status: 'error', error: 'Not enough session to ask about yet. A question comes once Claude has replied.' }))
    return
  }
  const fmt: Format = await read($, format)
  await update($, quiz, (): Quiz => ({ ...EMPTY, status: 'thinking', format: fmt }))

  const previous: string[] = await read($, asked)
  const topics = await savedFocus($)
  const focusField = topics.length > 0 ? ', "focus": "...", "bridge": "..."' : ''
  const shape =
    fmt === 'choice'
      ? `${CHOICE_RULES}\n${SOURCE_RULE}\n${TERM_RULE}\nReply as {"question": "...", "choices": ["right", "wrong", "wrong", "wrong"], "explanation": "...", "source": "...", "term": "...", "definition": "..."${focusField}}`
      : `${SOURCE_RULE}\n${TERM_RULE}\nReply as {"question": "...", "source": "...", "term": "...", "definition": "..."${focusField}}`
  const focus = topics.length > 0 ? `Areas the student wants to grow in:\n${topics.join('\n')}\n${FOCUS_RULE}\n\n` : ''
  const prompt = `Recent session:\n<session>\n${session.text}\n</session>\n\nAlready asked (pick a different concept or angle):\n${previous.slice(-10).join('\n') || '(none)'}\n\nTeaching move for this question: ${MOVES[previous.length % MOVES.length]}\n\n${focus}${shape}`

  const reply = await haiku($, ASK_SYSTEM, prompt, 400)
  const data = reply === undefined ? undefined : parseJson(reply)
  const question = str(data?.question)
  if (question === '') {
    await update($, quiz, (q): Quiz => ({ ...q, status: 'error', error: 'Could not make a question this time.' }))
    return
  }
  const given = Array.isArray(data?.choices) ? data.choices.map(String).slice(0, 4) : []
  const isChoice = fmt === 'choice' && given.length >= 2
  // Models put the right answer in the same slot too often; shuffle here.
  const order = given.map((_, i) => i).sort(() => Math.random() - 0.5)
  await update($, asked, list => [...list, question].slice(-30))
  await update($, quiz, (q): Quiz => ({
    ...q,
    status: 'asking',
    format: isChoice ? 'choice' : 'free',
    question,
    choices: isChoice ? order.map(i => given[i] ?? '') : [],
    correct: isChoice ? order.indexOf(0) : -1,
    explanation: str(data?.explanation),
    source: checkSource(data?.source, session),
    focus: checkLink(data?.focus, data?.bridge, question, topics),
    term: str(data?.term).trim(),
    definition: str(data?.definition).trim(),
  }))
  // Takes the keyboard only over an empty prompt, so it never interrupts typing.
  void openPane($, true)
}

const verdictOf = (feedback: string): Verdict | undefined => {
  const word = feedback.toLowerCase()
  return word.startsWith('solid') ? 'solid' : word.startsWith('partly') ? 'partly' : word.startsWith('not yet') ? 'notYet' : undefined
}

async function gradeFree($: Api, answer: string) {
  const q: Quiz = await read($, quiz)
  if (q.status !== 'asking' || answer.trim() === '') return
  await update($, quiz, (cur): Quiz => ({ ...cur, status: 'grading', answer }))
  const feedback = await haiku($, GRADE_SYSTEM, `Question: ${q.question}\n\nAnswer: ${answer}`, 300)
  const done = await update($, quiz, (cur): Quiz => ({
    ...cur,
    status: 'answered',
    feedback: feedback ?? 'Could not grade this one, but thanks for answering.',
    verdict: feedback === undefined ? undefined : verdictOf(feedback),
  }))
  await saveNote($, done)
}

async function submitChoice($: Api) {
  let changed = false
  const done = await update($, quiz, (cur): Quiz => {
    if (cur.status !== 'asking' || cur.selected < 0) return cur
    changed = true
    const isRight = cur.selected === cur.correct
    const right = cur.choices[cur.correct] ?? ''
    return {
      ...cur,
      status: 'answered',
      verdict: isRight ? 'solid' : 'notYet',
      answer: cur.choices[cur.selected] ?? '',
      feedback: `${isRight ? 'Solid.' : `Not yet. The answer is: ${/[.!?]$/.test(right) ? right : `${right}.`}`} ${cur.explanation}`.trim(),
    }
  })
  // A repeat press finds nothing to answer, so it never saves twice.
  if (changed) await saveNote($, done)
}

const isMiss = (q: Quiz) => q.verdict === 'partly' || q.verdict === 'notYet'

async function goDeeper($: Api) {
  const q: Quiz = await read($, quiz)
  if (q.status !== 'answered' || !isMiss(q)) return
  await update($, quiz, (cur): Quiz => ({ ...cur, status: 'teaching', lesson: '', error: '' }))
  const right = q.format === 'choice' ? `\n\nRight answer: ${q.choices[q.correct] ?? ''}` : ''
  const lesson = await haiku($, LESSON_SYSTEM, `Question: ${q.question}\n\nStudent's answer: ${q.answer}${right}\n\nFeedback they got: ${q.feedback}`, 350)
  await update($, quiz, (cur): Quiz => ({
    ...cur,
    status: 'taught',
    lesson: lesson ?? '',
    error: lesson === undefined ? 'Could not write a lesson this time.' : '',
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quiz',
      description: 'Open the Quiz pane. Args: now | focus <areas> | notes | limit <tokens>|off | settings | free | choice',
    })
    const saved = await $.store.get('format')
    if (saved === 'free' || saved === 'choice') await update($, format, () => saved)
    // A reload drops any model call in flight; state survives it, so settle
    // whatever that call left waiting.
    await update($, quiz, (q): Quiz => (isBusy(q.status) ? { ...q, status: BUSY[q.status] } : q))
    $.clock.every(450, () => void update($, petStep, n => n + 1))
    void openPane($)
    return next(e)
  })

  // Claude starts working: that's the idle window, so ask a question then.
  on('turn.start', async ($, e, next) => {
    const { status } = await read($, quiz)
    if (e.agentId === undefined && status !== 'asking' && !isBusy(status)) {
      $.clock.after(0, () => void askQuestion($))
    }
    return next(e)
  })

  on('command.run', { command: 'quiz' }, async ($, e) => {
    const [word = ''] = e.args.trim().split(/\s+/)
    const rest = e.args.trim().slice(word.length).trim()
    await openPane($)
    if (word === 'free' || word === 'choice') {
      await setFormat($, () => word)
      return { text: `Quiz format: ${word === 'free' ? 'free text' : 'multiple choice'}.` }
    }
    if (word === 'limit') {
      const n = Number(rest.replace(/,/g, ''))
      if (rest === 'off') await $.store.delete('dailyLimit')
      else if (Number.isInteger(n) && n > 0) await $.store.set('dailyLimit', n)
      else if (rest !== '') return { text: 'Usage: /quiz limit <tokens per day> or /quiz limit off' }
      const limit = await $.store.get('dailyLimit')
      return { text: typeof limit === 'number' ? `Daily limit: ${limit.toLocaleString('en-US')} tokens.` : 'No limit. The quiz never stops you.' }
    }
    if (word === 'settings') {
      await update($, showSettings, () => true)
      return { text: 'Quiz settings opened in the pane.' }
    }
    if (word === 'notes') return { text: `Your notes are in ${await notesDir($)}/notes.md.` }
    if (word === 'now') {
      void askQuestion($)
      return { text: 'Making a question.' }
    }
    if (word === 'focus') {
      if (rest === 'clear') await $.store.delete('focus')
      else if (rest !== '') await $.store.set('focus', parseFocus(rest))
      const topics = await savedFocus($)
      return {
        text: topics.length === 0 ? 'No focus areas. Add some with /quiz focus <area>, <area>.' : `Focus areas: ${topics.join(', ')}.`,
      }
    }
    return { text: 'Quiz pane opened. Run /quiz settings to see token use.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    // Mobile draws no text fields.
    const Input = 'Input' in els ? els.Input : undefined
    const q: Quiz = await read($, quiz)
    const fmt: Format = await read($, format)
    const isSettings: boolean = await read($, showSettings)
    const n = (x: number) => x.toLocaleString('en-US')
    // While a model call runs the pane holds no control, so the Enter that
    // submitted an answer has nothing to land on.
    const busy = isBusy(q.status)
    const asking = q.status === 'asking'
    const typing = asking && q.format === 'free' && Input !== undefined
    const width = Math.max(0, e.props.bodyColumns - 4)
    const rule = <Text dimColor>{'─'.repeat(width)}</Text>
    // The field's text area: the pane width less the padding, border and hint.
    const fieldWidth = Math.max(0, width - 10)
    const step: number = await read($, petStep)
    const pet = petAt(step, width - CAT_WIDTH - 1)

    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box flexDirection="column" marginBottom={1}>
          <Box justifyContent="space-between">
            <Text bold color="claude">Quiz</Text>
            <Text dimColor>{isSettings ? 'settings' : 'while Claude works'}</Text>
          </Box>
          {rule}
        </Box>
        {isSettings ? (
          <Box flexDirection="column">
            <Text bold>Tokens used</Text>
            <Text>Today: {n(await tokensToday($))}</Text>
            <Text>This session: {n(await read($, sessionTokens))}</Text>
          </Box>
        ) : q.status === 'idle' || q.status === 'thinking' || q.status === 'error' ? (
          <Text dimColor>
            {q.status === 'idle' ? 'A question will show up here while Claude works.' : q.status === 'thinking' ? 'Thinking of a question…' : q.error}
          </Text>
        ) : (
          <Box flexDirection="column">
            <Text bold>{q.question}</Text>
            {q.source !== '' && <Text dimColor>From: {q.source}</Text>}
            {q.focus !== '' && <Text dimColor>Linked to: {q.focus}</Text>}
            {asking && q.format === 'choice' && (
              <Box flexDirection="column" marginTop={1}>
                {q.choices.map((c, i) => (
                  <Button key={`choice-${i}`} hotkey={String(i + 1)} plain onPress={() => void update($, quiz, (cur): Quiz => ({ ...cur, selected: i }))}>
                    {q.selected === i ? <Text color="claude" bold>(•) {c}</Text> : <Text>( ) {c}</Text>}
                  </Button>
                ))}
              </Box>
            )}
            {asking && q.format === 'free' && Input === undefined && <Text dimColor>Free-text answers need the terminal or desktop app.</Text>}
            {typing && Input !== undefined && (
              <Box marginTop={1} flexDirection="column">
                <Text dimColor>Your answer</Text>
                <Box borderStyle="round" borderColor="claude" paddingX={1}>
                  <Input
                    // A new key per question gives each one an empty field.
                    key={`answer-${q.question}`}
                    placeholder="Type your answer"
                    rows={1}
                    autoFocus
                    submitLabel=""
                    value={q.draft}
                    onInput={(value: string) => void update($, quiz, (cur): Quiz => ({ ...cur, draft: value.slice(0, ANSWER_CHARS) }))}
                    onSubmit={(value: string) => void gradeFree($, value.slice(0, ANSWER_CHARS))}
                  />
                </Box>
                {/* The field scrolls a long line sideways; show the whole answer wrapped. */}
                {q.draft.length > fieldWidth && <Text dimColor>{q.draft}</Text>}
                {q.draft.length >= ANSWER_CHARS && <Text dimColor>That is as long as an answer can be. Keep it short.</Text>}
              </Box>
            )}
            {(q.status === 'answered' || q.status === 'teaching' || q.status === 'taught') && (
              <Box flexDirection="column" marginTop={1}>
                <Text dimColor>
                  {q.format === 'free' ? 'You said' : 'You picked'}: {q.answer}
                </Text>
                <Text>{q.feedback}</Text>
                {q.term !== '' && (
                  <Box marginTop={1}>
                    <Text>
                      <Text bold color="claude">{q.term}</Text>
                      {q.definition !== '' && `: ${q.definition}`}
                    </Text>
                  </Box>
                )}
              </Box>
            )}
            {(q.status === 'grading' || q.status === 'teaching') && (
              <Box marginTop={1}>
                <Text dimColor>{q.status === 'grading' ? 'Checking your answer…' : 'Writing a short lesson…'}</Text>
              </Box>
            )}
            {q.status === 'taught' && (
              <Box marginTop={1}>
                <Text dimColor={q.lesson === ''}>{q.lesson || q.error}</Text>
              </Box>
            )}
          </Box>
        )}
        {!isSettings && !busy && (
          <Box marginTop={1} gap={2}>
            {(q.status === 'idle' || q.status === 'error') && (
              <Button key="now" hotkey="n" variant="primary" onPress={() => void askQuestion($)}>
                {q.status === 'idle' ? 'Ask me now' : 'Try again'}
              </Button>
            )}
            {typing && (
              <Button key="send" variant="primary" onPress={() => void gradeFree($, q.draft)}>
                Submit
              </Button>
            )}
            {asking && q.format === 'choice' && (
              <Button key="submit" hotkey="a" variant="primary" onPress={() => void submitChoice($)}>
                Submit <Text dimColor>a</Text>
              </Button>
            )}
            {asking && (
              <Button key="skip" hotkey="s" onPress={() => void update($, quiz, (cur): Quiz => ({ ...cur, status: 'idle' }))}>
                Skip <Text dimColor>s</Text>
              </Button>
            )}
            {(q.status === 'answered' || q.status === 'taught') && (
              <Button key="next" hotkey="n" variant="primary" onPress={() => void askQuestion($)}>
                Next question
              </Button>
            )}
            {q.status === 'answered' && isMiss(q) && (
              <Button key="deeper" hotkey="d" onPress={() => void goDeeper($)}>
                Go deeper <Text dimColor>d</Text>
              </Button>
            )}
          </Box>
        )}
        <Box flexDirection="column" marginTop={1}>
          {rule}
          {(isSettings || !busy) && (
            <Box gap={2}>
              <Button key="format" hotkey="f" plain onPress={() => void setFormat($, f => (f === 'free' ? 'choice' : 'free'))}>
                Format <Text color="claude">{fmt === 'free' ? 'free text' : 'multiple choice'}</Text>
              </Button>
              {isSettings ? (
                <Button key="back" hotkey="b" variant="primary" onPress={() => void update($, showSettings, () => false)}>
                  Back to the quiz
                </Button>
              ) : (
                <Button key="settings" hotkey="g" plain onPress={() => void update($, showSettings, () => true)}>
                  Settings
                </Button>
              )}
            </Box>
          )}
          {!e.props.isFocused && <Text dimColor>ctrl+x tab to answer here</Text>}
        </Box>
        <Box flexDirection="column" marginTop={1}>
          <Text color="claude">{' '.repeat(pet.right ? pet.x + 1 : pet.x)}{CAT_TOP}</Text>
          <Text color="claude">{' '.repeat(pet.x)}{catBody(pet.right, step % 2 === 0)}</Text>
        </Box>
      </Box>
    )
  })
}

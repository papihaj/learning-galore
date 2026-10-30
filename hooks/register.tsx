import { atom, read, update } from 'claude-code'
import type { EngineInterface as Api, Register } from 'claude-code'

import type { Format, Note, Quiz, Verdict } from '../types'
import { CAT_ROWS, catCells } from './cat'
import { checkLink, parseFocus } from './focus'
import { answerOf, flow, spokenChoice } from './answer'
import { appendNote, buildNote, toMarkdown } from './notes'
import { isSecretPath, redact } from './redact'

const PANE = 'study-buddy'
const CAT_STEP_MS = 180
let catStep = 0
let catWidth = 0
const CONTEXT_CHARS = 6000
const ANSWER_CHARS = 600

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
  lines: [],
  feedback: '',
  lesson: '',
  error: '',
  source: '',
  focus: '',
  term: '',
  definition: '',
}

const quiz = atom({ plugin: 'study-buddy', key: 'quiz' } as const, EMPTY, { shape: 'quiz-mvp-4' })
const format = atom({ plugin: 'study-buddy', key: 'format' } as const, 'free', { shape: 'format-1' })
const asked = atom({ plugin: 'study-buddy', key: 'asked' } as const, [], { shape: 'asked-1' })
const showSettings = atom({ plugin: 'study-buddy', key: 'showSettings' } as const, false, { shape: 'show-settings-1' })
const sessionTokens = atom({ plugin: 'study-buddy', key: 'sessionTokens' } as const, 0, { shape: 'session-tokens-1' })
const listening = atom({ plugin: 'study-buddy', key: 'listening' } as const, false, { shape: 'listening-1' })

const BUSY = { thinking: 'idle', grading: 'asking', teaching: 'answered' } as const
const isBusy = (status: Quiz['status']): status is keyof typeof BUSY => status in BUSY

const ASK_SYSTEM = `You are a professor who teaches software engineering well. Your student is a developer who just worked through the session below with a coding assistant. You write one review question that makes them retrieve and reason about the ideas behind that work, so they keep it.

How you teach:
- Build the question around one key concept behind what the developer is building: an idea from systems design, architecture or engineering practice that they should understand while they build, such as debounce, idempotency, a composite index, cache invalidation or a message queue. Ask what it means and why it matters in what they are building, in their own words.
- Ask only about the big, central ideas of the session: the concepts a senior engineer would want the student to still know in a year. Skip small details, syntax, configuration, and trivia (file names, exact code, what the assistant said).
- The question must be answerable from understanding alone, in a sentence or a short paragraph (under ${ANSWER_CHARS} characters), so ask exactly one thing. If an idea needs an essay, ask about one part of it.
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
    if (m.text.trim() !== '') lines.push(`${m.role}: ${clip(redact(m.text.trim()), 600)}`)
    said.push(m.text.split(cwd + '/').join(''))
    for (const t of m.toolUses) {
      const secret = t.input.file_path ?? t.input.path
      if (typeof secret === 'string' && isSecretPath(secret)) continue
      const file = t.input.file_path ?? t.input.notebook_path
      if (typeof file === 'string') paths.add(relative(file))
      const target = typeof file === 'string' ? relative(file) : (t.input.command ?? t.input.pattern ?? '')
      lines.push(`tool ${t.tool}: ${clip(redact(String(target)), 120)}`)
      if (typeof t.text === 'string') said.push(t.text.split(cwd + '/').join(''))
    }
  }
  const text = lines.join('\n')
  return { text: text.slice(-CONTEXT_CHARS), paths, said: said.join('\n') }
}

function checkSource(given: unknown, { paths, said }: Digest): string {
  const [, path = '', line] = str(given).trim().match(/^(.+?)(?::(\d+))?$/) ?? []
  if (!paths.has(path)) return ''
  if (line === undefined) return path
  const cited = `${path}:${line}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[\\s\`'"(])${cited}(?!\\d)`, 'm').test(said) ? `${path}:${line}` : path
}

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  } catch {
    return undefined
  }
}

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type Today = { day: string; tokens: number }

const tokensToday = async ($: Api): Promise<number> => {
  const saved = (await $.store.get('tokensToday')) as Today | undefined
  return saved?.day === dayKey(new Date()) ? saved.tokens : 0
}

async function haiku($: Api, system: string, prompt: string, maxTokens: number): Promise<string | undefined> {
  try {
    const r = await $.model.complete({ model: 'haiku', system, prompt, maxTokens, effort: 'low', timeoutMs: 30000 })
    const n = r.usage.input_tokens + r.usage.output_tokens
    await update($, sessionTokens, t => t + n)
    await $.store.set('tokensToday', { day: dayKey(new Date()), tokens: (await tokensToday($)) + n } satisfies Today)
    return r.isAnswered ? r.text.trim() : undefined
  } catch {
    return undefined
  }
}

const notesDir = async ($: Api) => `${await $.session.cwd()}/study-buddy-notes`

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

const openPane = ($: Api, focus?: true) => $.ui.open({ id: PANE, title: 'Study Buddy', focus })

const setFormat = async ($: Api, fn: (f: Format) => Format) => $.store.set('format', await update($, format, fn))

async function askQuestion($: Api) {
  if (isBusy((await read($, quiz)).status)) return
  const limit = await $.store.get('dailyLimit')
  if (typeof limit === 'number' && (await tokensToday($)) >= limit) {
    await update($, quiz, (): Quiz => ({ ...EMPTY, status: 'error', error: `You reached today's limit of ${limit.toLocaleString('en-US')} tokens. Run /buddy limit off to remove it.` }))
    return
  }
  const session = await digest($)
  if (session.text.length < 200) {
    await update($, quiz, (): Quiz => ({ ...EMPTY, status: 'error', error: 'Not enough session to ask about yet. A question comes once Claude has replied.' }))
    return
  }
  const fmt: Format = await read($, format)
  await update($, quiz, (): Quiz => ({ ...EMPTY, status: 'thinking', format: fmt }))
  await update($, listening, () => false)

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
      name: 'buddy',
      description: 'Open Study Buddy. Args: now | speak | focus <areas> | notes | limit <tokens>|off | settings | free | choice',
    })
    const saved = await $.store.get('format')
    if (saved === 'free' || saved === 'choice') await update($, format, () => saved)
    await update($, quiz, (q): Quiz => (isBusy(q.status) ? { ...q, status: BUSY[q.status] } : q))
    await update($, listening, () => false)
    void openPane($)
    $.clock.every(CAT_STEP_MS, () => {
      catStep += 1
      if (catWidth > 0) void $.ui.blit({ requestId: PANE, key: 'cat', columns: catWidth, rows: CAT_ROWS, cells: catCells(catWidth, catStep) }).catch(() => undefined)
    })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    if (e.command !== undefined || e.isMeta || !(await read($, listening))) return next(e)
    const q: Quiz = await read($, quiz)
    const spoken = e.text.trim()
    if (q.status !== 'asking') {
      await update($, listening, () => false)
      return next(e)
    }
    if (spoken === '') return { drop: 'Nothing heard. Speak your answer again, or press v in Study Buddy to stop.' }
    if (q.format === 'choice') {
      const i = spokenChoice(spoken, q.choices)
      if (i < 0) return { drop: `Not sure which choice you meant by "${clip(spoken, 60)}". Say its number, like "two".` }
      await update($, listening, () => false)
      await update($, quiz, (cur): Quiz => ({ ...cur, selected: i }))
      void submitChoice($)
    } else {
      await update($, listening, () => false)
      void gradeFree($, spoken.slice(0, ANSWER_CHARS))
    }
    void openPane($)
    return { drop: 'Sent to Study Buddy as your spoken answer.' }
  })

  on('turn.start', async ($, e, next) => {
    const { status } = await read($, quiz)
    if (e.agentId === undefined && status !== 'asking' && !isBusy(status)) {
      $.clock.after(0, () => void askQuestion($))
    }
    return next(e)
  })

  on('command.run', { command: 'buddy' }, async ($, e) => {
    const [word = ''] = e.args.trim().split(/\s+/)
    const rest = e.args.trim().slice(word.length).trim()
    await openPane($)
    if (word === 'free' || word === 'choice') {
      await setFormat($, () => word)
      return { text: `Study Buddy format: ${word === 'free' ? 'free text' : 'multiple choice'}.` }
    }
    if (word === 'limit') {
      const n = Number(rest.replace(/,/g, ''))
      if (rest === 'off') await $.store.delete('dailyLimit')
      else if (Number.isInteger(n) && n > 0) await $.store.set('dailyLimit', n)
      else if (rest !== '') return { text: 'Usage: /buddy limit <tokens per day> or /buddy limit off' }
      const limit = await $.store.get('dailyLimit')
      return { text: typeof limit === 'number' ? `Daily limit: ${limit.toLocaleString('en-US')} tokens.` : 'No limit. Study Buddy never stops you.' }
    }
    if (word === 'settings') {
      await update($, showSettings, () => true)
      return { text: 'Study Buddy settings opened in the pane.' }
    }
    if (word === 'notes') return { text: `Your notes are in ${await notesDir($)}/notes.md.` }
    if (word === 'speak') {
      if ((await read($, quiz)).status !== 'asking') return { text: 'No question is waiting. Run /buddy now for one.' }
      await update($, listening, () => true)
      return { text: 'Listening: dictate your answer in the prompt box and press Enter.' }
    }
    if (word === 'now') {
      void askQuestion($)
      return { text: 'Making a question.' }
    }
    if (word === 'focus') {
      if (rest === 'clear') await $.store.delete('focus')
      else if (rest !== '') await $.store.set('focus', parseFocus(rest))
      const topics = await savedFocus($)
      return {
        text: topics.length === 0 ? 'No focus areas. Add some with /buddy focus <area>, <area>.' : `Focus areas: ${topics.join(', ')}.`,
      }
    }
    return { text: 'Study Buddy opened. Run /buddy settings to see token use.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Raster = 'Raster' in els ? els.Raster : undefined
    const Input = 'Input' in els ? els.Input : undefined
    const q: Quiz = await read($, quiz)
    const fmt: Format = await read($, format)
    const isSettings: boolean = await read($, showSettings)
    const n = (x: number) => x.toLocaleString('en-US')
    const busy = isBusy(q.status)
    const asking = q.status === 'asking'
    const typing = asking && q.format === 'free' && Input !== undefined
    const width = Math.max(0, e.props.bodyColumns - 4)
    catWidth = width
    const rule = <Text dimColor>{'─'.repeat(width)}</Text>
    const room = Math.max(10, width - 6)
    const isListening = asking && (await read($, listening))
    const fill = e.props.placement === 'dock' ? e.props.scroll.bodyRows : undefined

    return (
      <Box flexDirection="column" paddingX={2} paddingY={1} width={e.props.bodyColumns} minHeight={fill}>
        <Box flexDirection="column" marginBottom={1} width={width}>
          <Box justifyContent="space-between">
            <Text bold color="claude">Study Buddy</Text>
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
            {asking && q.format === 'free' && Input === undefined && !isListening && <Text dimColor>Free-text answers need the terminal or desktop app, or press v to speak one.</Text>}
            {isListening && (
              <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
                <Text bold color="claude">Listening for your answer</Text>
                <Text>
                  Dictate it into the main prompt box (hold Space with /voice on, or tap the mic), then press Enter. It goes to Study Buddy, not to Claude.
                </Text>
                {q.format === 'choice' && <Text dimColor>Say the choice's number, like "two", or its words.</Text>}
              </Box>
            )}
            {typing && !isListening && Input !== undefined && (
              <Box marginTop={1} flexDirection="column">
                <Text dimColor>Your answer</Text>
                <Box borderStyle="round" borderColor="claude" paddingX={1} flexDirection="column">
                  {q.lines.map((line, i) => (
                    <Text key={`line-${i}`}>{line}</Text>
                  ))}
                  <Input
                    key={`answer-${q.question}`}
                    placeholder="Type your answer"
                    rows={1}
                    autoFocus
                    submitLabel=""
                    value={q.draft}
                    onInput={(value: string) =>
                      void update($, quiz, (cur): Quiz => {
                        const left = Math.max(0, ANSWER_CHARS - answerOf(cur, '').length)
                        return { ...cur, ...flow(cur.lines, value.slice(0, left), room) }
                      })
                    }
                    onSubmit={(value: string) => void gradeFree($, answerOf(q, value))}
                  />
                </Box>
                {answerOf(q).length >= ANSWER_CHARS && <Text dimColor>That is as long as an answer can be.</Text>}
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
            {typing && !isListening && (
              <Button key="send" variant="primary" onPress={() => void gradeFree($, answerOf(q))}>
                Submit
              </Button>
            )}
            {asking && q.format === 'choice' && (
              <Button key="submit" hotkey="a" variant="primary" onPress={() => void submitChoice($)}>
                Submit <Text dimColor>a</Text>
              </Button>
            )}
            {asking && (
              <Button key="speak" hotkey="v" onPress={() => void update($, listening, was => !was)}>
                {isListening ? 'Stop listening' : 'Speak'} <Text dimColor>v</Text>
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
        <Box flexGrow={1} />
        <Box flexDirection="column" marginTop={1}>
          {rule}
          {(isSettings || !busy) && (
            <Box gap={2}>
              <Button key="format" hotkey="f" plain onPress={() => void setFormat($, f => (f === 'free' ? 'choice' : 'free'))}>
                Format <Text color="claude">{fmt === 'free' ? 'free text' : 'multiple choice'}</Text>
              </Button>
              {isSettings ? (
                <Button key="back" hotkey="b" variant="primary" onPress={() => void update($, showSettings, () => false)}>
                  Back to the questions
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
        {Raster !== undefined && width > 0 && (
          <Box marginTop={1}>
            <Raster key="cat" columns={width} rows={CAT_ROWS} cells={catCells(width, catStep)} />
          </Box>
        )}
      </Box>
    )
  })
}

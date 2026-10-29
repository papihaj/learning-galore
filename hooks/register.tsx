import { atom, read, update } from 'claude-code'
import type { EngineInterface as Api, Register, RenderChildren } from 'claude-code'

import type { Format, Quiz, QuizSettings, QuizUsage } from '../types'
import { isSecretPath, redact } from './redact'

const PANE = 'session-quiz'
const MODEL = 'haiku'
// Caps on each call, so one question never costs much.
const ASK_MAX_TOKENS = 400
const GRADE_MAX_TOKENS = 300
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
  error: '',
}
const DEFAULTS: QuizSettings = { format: 'free', budget: 20000, maxQuestions: 10 }

const quiz = atom({ plugin: 'session-quiz', key: 'quiz' } as const, EMPTY, {
  shape: 'quiz-3',
})
const usage = atom(
  { plugin: 'session-quiz', key: 'usage' } as const,
  { tokens: 0, questions: 0 },
  { shape: 'usage-1' },
)
const settings = atom(
  { plugin: 'session-quiz', key: 'settings' } as const,
  DEFAULTS,
  { shape: 'settings-1' },
)
const asked = atom({ plugin: 'session-quiz', key: 'asked' } as const, [], {
  shape: 'asked-1',
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

const GRADE_SYSTEM = `You are a kind, exact professor giving feedback on a student's short answer to a review question.
Open with one verdict word: "Solid.", "Partly." or "Not yet."
Then, in at most two short sentences: name what they got right, and name the specific gap or misconception (not a vague "add more detail").
End with the key idea in one plain sentence. Do not ask the student anything: they cannot reply.
At most 60 words in all. Plain text, no headings, no lists.`

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s)

async function digest($: Api): Promise<string> {
  const rows = await $.session.messages()
  const lines: string[] = []
  for (const m of rows.slice(-40)) {
    // Redact before clipping, so a cut never leaves half a key behind.
    if (m.text.trim() !== '') lines.push(`${m.role}: ${clip(redact(m.text.trim()), 600)}`)
    for (const t of m.toolUses) {
      const path = t.input.file_path ?? t.input.path
      if (typeof path === 'string' && isSecretPath(path)) continue
      const target = t.input.file_path ?? t.input.command ?? t.input.pattern ?? ''
      lines.push(`tool ${t.tool}: ${clip(redact(String(target)), 120)}`)
    }
  }
  const text = lines.join('\n')
  return text.length > CONTEXT_CHARS ? text.slice(-CONTEXT_CHARS) : text
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

async function spend($: Api, r: { input_tokens: number; output_tokens: number }) {
  await update($, usage, u => ({
    ...u,
    tokens: u.tokens + r.input_tokens + r.output_tokens,
  }))
}

async function overBudget($: Api): Promise<string | undefined> {
  const u: QuizUsage = await read($, usage)
  const s: QuizSettings = await read($, settings)
  if (u.tokens >= s.budget) return `Token budget used up (${u.tokens}/${s.budget}).`
  if (u.questions >= s.maxQuestions) return `Question limit reached (${s.maxQuestions}).`
  return undefined
}

const openPane = ($: Api) => $.ui.open({ id: PANE, title: 'Quiz' })

async function askQuestion($: Api) {
  const current: Quiz = await read($, quiz)
  if (current.status === 'thinking' || current.status === 'grading') return
  const stop = await overBudget($)
  if (stop !== undefined) {
    await update($, quiz, (): Quiz => ({ ...EMPTY, status: 'error', error: `${stop} Raise it with /quiz max or /quiz budget.` }))
    return
  }
  const context = await digest($)
  if (context.length < 200) {
    await update($, quiz, (): Quiz => ({ ...EMPTY, status: 'error', error: 'Not enough session to ask about yet. A question comes once Claude has replied.' }))
    return
  }
  const { format }: QuizSettings = await read($, settings)
  await update($, quiz, (): Quiz => ({ ...EMPTY, status: 'thinking', format }))

  const previous: string[] = await read($, asked)
  const move = MOVES[previous.length % MOVES.length]
  const shape =
    format === 'choice'
      ? `${CHOICE_RULES}\nReply as {"question": "...", "choices": ["right", "wrong", "wrong", "wrong"], "explanation": "..."}`
      : 'Reply as {"question": "..."}'
  const prompt = `Recent session:\n<session>\n${context}\n</session>\n\nAlready asked (pick a different concept or angle):\n${previous.slice(-10).join('\n') || '(none)'}\n\nTeaching move for this question: ${move}\n\n${shape}`

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
  }))
  $.ui.status('A quiz question is waiting')
  // Takes the keyboard only over an empty prompt, so it never interrupts typing.
  void $.ui.open({ id: PANE, title: 'Quiz', focus: true })
}

async function gradeFree($: Api, answer: string) {
  const q: Quiz = await read($, quiz)
  if (q.status !== 'asking' || answer.trim() === '') return
  const stop = await overBudget($)
  // The question is already paid for; grading may run slightly over the budget.
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
  $.ui.status(stop)
}

const selectChoice = ($: Api, index: number) =>
  update($, quiz, (cur): Quiz => (cur.status === 'asking' ? { ...cur, selected: index } : cur))

async function submitChoice($: Api) {
  await update($, quiz, (cur): Quiz => {
    const index = cur.selected
    if (cur.status !== 'asking' || index < 0) return cur
    const isRight = index === cur.correct
    const right = cur.choices[cur.correct] ?? ''
    return {
      ...cur,
      status: 'answered',
      answer: cur.choices[index] ?? '',
      feedback: `${isRight ? 'Solid.' : `Not yet. The answer is: ${right}`} ${cur.explanation}`.trim(),
    }
  })
  $.ui.status(undefined)
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quiz',
      description: 'Open the Quiz pane. Args: now | free | choice | budget <tokens> | max <questions> | reset',
    })
    const saved = await $.store.get('settings')
    if (saved !== undefined) await update($, settings, () => ({ ...DEFAULTS, ...(saved as Partial<QuizSettings>) }))
    $.ui.status(undefined)
    // A reload drops any model call in flight; state survives it, so settle
    // whatever that call left waiting.
    await update($, quiz, (q): Quiz =>
      q.status === 'thinking' ? { ...q, status: 'idle' } : q.status === 'grading' ? { ...q, status: 'asking' } : q,
    )
    void openPane($)

    return next(e)
  })

  // Claude starts working: that's the idle window, so ask a question then.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const q: Quiz = await read($, quiz)
    if (q.status === 'idle' || q.status === 'answered' || q.status === 'error') {
      $.clock.after(0, () => void askQuestion($))
    }

    return next(e)
  })

  on('command.run', { command: 'quiz' }, async ($, e) => {
    const [word = '', value = ''] = e.args.trim().split(/\s+/)
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
    if (word === 'budget' || word === 'max') {
      const n = Number(value)
      if (!Number.isInteger(n) || n <= 0) return { text: `Usage: /quiz ${word} <positive number>` }
      const s = await save(cur => (word === 'budget' ? { ...cur, budget: n } : { ...cur, maxQuestions: n }))
      return { text: `Quiz limits: ${s.budget} tokens, ${s.maxQuestions} questions per session.` }
    }
    if (word === 'reset') {
      await update($, usage, () => ({ tokens: 0, questions: 0 }))
      return { text: 'Quiz usage for this session reset.' }
    }
    if (word === 'now') {
      void askQuestion($)
      return { text: 'Making a question.' }
    }
    const u: QuizUsage = await read($, usage)
    const s: QuizSettings = await read($, settings)
    return { text: `Quiz pane opened. Used ${u.tokens}/${s.budget} tokens, ${u.questions}/${s.maxQuestions} questions.` }
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

    // While a model call runs the pane holds no control, so the Enter that
    // submitted an answer has nothing to land on.
    // The field's text area: the pane width less the border, padding and hint.
    const fieldWidth = Math.max(0, e.props.bodyColumns - 10)
    const isBusy = q.status === 'thinking' || q.status === 'grading'
    // `claude` is the theme's own accent, so the pane follows the person's theme.
    const ACCENT = 'claude'
    const header = (
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={ACCENT}>Quiz</Text>
        <Text dimColor>while Claude works</Text>
      </Box>
    )
    const footer = (
      <Box flexDirection="column" marginTop={1}>
        {!isBusy && (
          <Button key="format" hotkey="f" plain onPress={toggleFormat}>
            Format <Text color={ACCENT}>{s.format === 'free' ? 'free text' : 'multiple choice'}</Text>
          </Button>
        )}
        <Text dimColor>
          {u.questions}/{s.maxQuestions} questions this session
          {e.props.isFocused ? '' : ' · ctrl+x tab to answer here'}
        </Text>
      </Box>
    )
    const frame = (...body: RenderChildren[]) => (
      <Box flexDirection="column">
        {header}
        {body}
        {footer}
      </Box>
    )

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
        </Box>
      ),
      q.status === 'grading' && <Text dimColor>Checking your answer…</Text>,
      q.status === 'answered' && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>
            {q.format === 'free' ? 'You said' : 'You picked'}: {clip(q.answer, 300)}
          </Text>
          <Text>{q.feedback}</Text>
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
          <Button key="skip" hotkey="s" onPress={() => void update($, quiz, (cur): Quiz => ({ ...cur, status: 'idle' }))}>
            Skip <Text dimColor>s</Text>
          </Button>
        )}
        {q.status === 'asking' && q.format === 'free' && (
          <Text dimColor>
            {q.draft.length}/{ANSWER_CHARS}
          </Text>
        )}
        {q.status === 'answered' && (
          <Button key="next" hotkey="n" variant="primary" onPress={() => void askQuestion($)}>Next question</Button>
        )}
      </Box>,
    )
  })
}

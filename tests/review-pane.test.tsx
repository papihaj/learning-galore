import { expect, mock, test } from 'claude-code/testing'

import type { ReviewItem } from '../types'

const PANE = {
  plugin: 'session-quiz',
  component: 'Pane',
  requestId: 'session-quiz',
  props: {
    title: 'Quiz',
    isFocused: true,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const DUE: ReviewItem = {
  question: 'Why debounce a search box?',
  format: 'choice',
  choices: ['To send fewer requests while typing', 'To cache results', 'To sort results', 'To validate input'],
  explanation: 'Each keystroke would otherwise start a request.',
  source: '',
  added: '2026-10-20',
  interval: 1,
  due: '2026-10-21',
}

// As typed at the prompt: `/quiz review`.
const REVIEW = {
  command: 'quiz',
  args: 'review',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 100 },
} as const

test('a due review item is asked with no model call, and a miss resets it to one day', async ($, on) => {
  mock.store(on, { review: [DUE] })
  // Noon local time on 2026-10-28, a week after the item came due.
  mock.clock(on, { now: new Date(2026, 9, 28, 12).getTime() })
  on('command.register', () => ({ value: { command: 'quiz' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  let calls = 0
  on('model.complete', () => {
    calls += 1
    return { value: { isAnswered: false, reason: 'empty-reply', usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const { text } = await $.command.run(REVIEW)
  expect(text).toBe('1 review question due, 1 queued. Asking the most overdue.')

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Review from/ }))?.text).toBe('Review from 2026-10-20')
  expect(calls).toBe(0)

  // Pick a wrong choice, whichever slot the shuffle put it in.
  for (let i = 0; i < 4; i++) {
    const button = await ui.find({ key: `choice-${i}` })
    if (!button?.text.includes(DUE.choices[0] ?? '')) {
      await ui.press({ key: `choice-${i}` })
      break
    }
  }
  await ui.press({ key: 'submit' })
  expect((await ui.find({ type: 'Text', text: /^Not yet\./ }))?.text).toContain('To send fewer requests while typing.')
  await ui.unmount()

  const after = await $.command.run(REVIEW)
  expect(after.text).toBe('0 review questions due, 1 queued. Next due 2026-10-29.')
})

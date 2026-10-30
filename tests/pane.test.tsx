import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'session-quiz',
  component: 'Pane',
  requestId: 'session-quiz',
  props: {
    title: 'Quiz',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('the pane shows no art or animation', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /\|=======\|/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /o\.o/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /A question will show up here/ })).toBeDefined()
    await ui.unmount()
  }
})

const TYPED = { wait: false, origin: { kind: 'composer' as const } }

const REPLY = JSON.stringify({
  question: 'What happens to writes when you add an index?',
  choices: ['Writes slow down because every index must be updated', 'Reads slow down because the table gets locked', 'Nothing changes at all', 'Old rows are dropped'],
  explanation: 'Each insert updates every index.',
  term: 'index',
  definition: 'A lookup structure kept beside a table.',
})

test('a spoken answer goes to the quiz, not to Claude', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.messages', () => ({ value: [{ role: 'assistant', text: 'Added a composite index on orders. '.repeat(10), toolUses: [] }] }))
  on('session.cwd', () => ({ value: '/p' }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('model.complete', () => ({ value: { text: REPLY, isAnswered: true, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }))
  on('prompt.submit', (_, e) => ({ text: e.text }))

  await $.command.run({ command: 'quiz', args: 'choice', ...TYPED, presentation: { isFullscreen: true, columns: 120 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'now' })
  await ui.press({ key: 'speak' })
  expect(await ui.find({ type: 'Text', text: /Listening for your answer/ })).toBeDefined()

  const sent = await $.prompt.submit({ text: 'writes slow down because every index must be updated', ...TYPED })
  expect(sent.drop).toBe('Sent to the Quiz as your spoken answer.')
  expect(await ui.find({ type: 'Text', text: /^Solid\./ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Listening/ })).toBeUndefined()

  const later = await $.prompt.submit({ text: 'fix the bug', ...TYPED })
  expect(later.drop).toBeUndefined()
  await ui.unmount()
})

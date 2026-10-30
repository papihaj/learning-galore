import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'study-buddy',
  component: 'Pane',
  requestId: 'study-buddy',
  props: {
    title: 'Study Buddy',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('the idle pane says a question is coming', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
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

test('picking the right choice grades it Solid', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.messages', () => ({ value: [{ role: 'assistant', text: 'Added a composite index on orders. '.repeat(10), toolUses: [] }] }))
  on('session.cwd', () => ({ value: '/p' }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('model.complete', () => ({ value: { text: REPLY, isAnswered: true, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }))

  await $.command.run({ command: 'buddy', args: 'choice', ...TYPED, presentation: { isFullscreen: true, columns: 120 } })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'now' })
  expect(await ui.find({ type: 'Button', key: 'speak' })).toBeUndefined()
  for (let i = 0; i < 4; i++) {
    await ui.press({ key: `choice-${i}` })
    if (await ui.find({ type: 'Text', text: /^\(•\) Writes slow down/ })) break
  }
  await ui.press({ key: 'submit' })
  expect(await ui.find({ type: 'Text', text: /^Solid\./ })).toBeDefined()
  await ui.unmount()
})

import { describe, expect, test } from 'claude-code/testing'

import { checkFocus, checkLink, parseFocus } from '../hooks/focus'

describe('parseFocus', () => {
  test('splits topics on commas and trims them', () => {
    expect(parseFocus(' SQL indexes,React effects , ')).toEqual(['SQL indexes', 'React effects'])
  })

  test('keeps the first spelling of a repeated topic', () => {
    expect(parseFocus('SQL indexes, sql  INDEXES')).toEqual(['SQL indexes'])
  })

  test('gives no topics for empty text', () => {
    expect(parseFocus('  ,  ')).toEqual([])
  })

  test('cuts a very long topic', () => {
    expect(parseFocus('x'.repeat(100))[0]?.length).toBe(60)
  })
})

describe('checkFocus', () => {
  const topics = ['SQL indexes', 'React effects']

  test('returns the saved spelling of a match', () => {
    expect(checkFocus(' sql indexes ', topics)).toBe('SQL indexes')
  })

  test('drops a topic that was never saved', () => {
    expect(checkFocus('Caching', topics)).toBe('')
  })

  test('drops a value that is not text', () => {
    expect(checkFocus(undefined, topics)).toBe('')
    expect(checkFocus(3, topics)).toBe('')
  })
})

describe('checkLink', () => {
  const topics = ['data science']
  const q = 'Debounce waits for a pause. Where does that idea show up when you batch a stream of events before a model sees them?'

  test('keeps a link whose bridge shows up in the question', () => {
    expect(checkLink('Data Science', 'batching events before a model', q, topics)).toBe('data science (batching events before a model)')
  })

  test('drops a link the question never makes', () => {
    expect(checkLink('data science', 'feature engineering pipelines', 'Why does the debounced value feed the search?', topics)).toBe('')
  })

  test('drops a link with no bridge or an unsaved area', () => {
    expect(checkLink('data science', undefined, q, topics)).toBe('')
    expect(checkLink('robotics', 'batching events', q, topics)).toBe('')
  })
})

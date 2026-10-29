import { describe, expect, test } from 'claude-code/testing'

import { checkFocus, parseFocus } from '../hooks/focus'

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

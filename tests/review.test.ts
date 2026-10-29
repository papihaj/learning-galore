import { describe, expect, test } from 'claude-code/testing'

import type { ReviewItem } from '../types'
import { QUEUE_MAX, addDays, pickDue, schedule, upsert } from '../hooks/review'

const item = (over: Partial<ReviewItem> = {}): ReviewItem => ({
  question: 'Why debounce a search box?',
  format: 'free',
  choices: [],
  explanation: '',
  source: '',
  added: '2026-10-01',
  interval: 0,
  due: '2026-10-01',
  ...over,
})

describe('schedule', () => {
  test('a first miss is due the next day', () => {
    const next = schedule(item(), 'notYet', '2026-10-01')
    expect(next?.interval).toBe(1)
    expect(next?.due).toBe('2026-10-02')
  })

  test('Partly counts as a miss', () => {
    expect(schedule(item(), 'partly', '2026-10-01')?.due).toBe('2026-10-02')
  })

  test('a new question answered well is not queued', () => {
    expect(schedule(item(), 'solid', '2026-10-01')).toBeUndefined()
  })

  test('each later Solid widens the gap: 1, 3, 7, 21 days, then retires', () => {
    let cur: ReviewItem | undefined = schedule(item(), 'notYet', '2026-10-01')
    const gaps: number[] = []
    let today = '2026-10-01'
    while (cur !== undefined) {
      gaps.push(cur.interval)
      today = cur.due
      cur = schedule(cur, 'solid', today)
    }
    expect(gaps).toEqual([1, 3, 7, 21])
  })

  test('a miss at any gap resets to one day', () => {
    const next = schedule(item({ interval: 7, due: '2026-10-20' }), 'notYet', '2026-10-20')
    expect(next?.interval).toBe(1)
    expect(next?.due).toBe('2026-10-21')
  })

  test('keeps the question, choices and first-missed date', () => {
    const mc = item({ format: 'choice', choices: ['right', 'a', 'b', 'c'], explanation: 'why', interval: 1 })
    const next = schedule(mc, 'solid', '2026-10-02')
    expect(next).toEqual({ ...mc, interval: 3, due: '2026-10-05' })
  })
})

test('addDays crosses months and years', () => {
  expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
  expect(addDays('2026-12-25', 7)).toBe('2027-01-01')
})

describe('pickDue', () => {
  const queue = [
    item({ question: 'later', due: '2026-10-30' }),
    item({ question: 'today', due: '2026-10-28' }),
    item({ question: 'oldest', due: '2026-10-10' }),
  ]

  test('picks the most overdue', () => {
    expect(pickDue(queue, '2026-10-28')?.question).toBe('oldest')
  })

  test('an item due today counts', () => {
    expect(pickDue(queue.slice(0, 2), '2026-10-28')?.question).toBe('today')
  })

  test('nothing due gives undefined', () => {
    expect(pickDue(queue, '2026-10-01')).toBeUndefined()
    expect(pickDue([], '2026-10-28')).toBeUndefined()
  })
})

describe('upsert', () => {
  test('replaces an item with the same question', () => {
    const queue = [item({ question: 'a', due: '2026-10-05' })]
    expect(upsert(queue, 'a', item({ question: 'a', due: '2026-10-09' }))).toEqual([item({ question: 'a', due: '2026-10-09' })])
  })

  test('removes an item when there is no next state', () => {
    expect(upsert([item({ question: 'a' }), item({ question: 'b' })], 'a', undefined)).toEqual([item({ question: 'b' })])
  })

  test('over the cap, drops the items due last', () => {
    const full = Array.from({ length: QUEUE_MAX }, (_, i) => item({ question: `q${i}`, due: addDays('2026-10-01', i) }))
    const out = upsert(full, 'new', item({ question: 'new', due: '2026-09-01' }))
    expect(out).toHaveLength(QUEUE_MAX)
    expect(out[0]?.question).toBe('new')
    expect(out.some(r => r.question === `q${QUEUE_MAX - 1}`)).toBe(false)
  })
})

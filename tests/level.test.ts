import { describe, expect, test } from 'claude-code/testing'

import { startLevel, stepLevel } from '../hooks/level'
import type { Difficulty, Verdict } from '../types'

const steps = (start: Difficulty, verdicts: Verdict[]) => verdicts.reduce(stepLevel, start)

describe('startLevel', () => {
  test('starts in the middle with no record', () => {
    expect(startLevel([])).toBe(2)
    expect(startLevel(['solid', 'solid', 'solid'])).toBe(2)
  })

  test('starts high after a strong record', () => {
    expect(startLevel(['solid', 'solid', 'partly', 'solid', 'solid'])).toBe(3)
  })

  test('starts low after a weak record', () => {
    expect(startLevel(['notYet', 'partly', 'notYet', 'solid', 'notYet'])).toBe(1)
  })

  test('reads only the last 5 answers', () => {
    expect(startLevel(['solid', 'solid', 'notYet', 'notYet', 'solid', 'solid', 'solid'])).toBe(2)
    expect(startLevel(['notYet', 'notYet', 'solid', 'solid', 'solid', 'solid', 'solid'])).toBe(3)
  })
})

describe('stepLevel', () => {
  test('steps up after two Solid answers in a row', () => {
    expect(steps({ level: 2, run: 0 }, ['solid', 'solid'])).toEqual({ level: 3, run: 0 })
  })

  test('steps down after two misses in a row', () => {
    expect(steps({ level: 2, run: 0 }, ['partly', 'notYet'])).toEqual({ level: 1, run: 0 })
  })

  test('holds when answers alternate', () => {
    expect(steps({ level: 2, run: 0 }, ['solid', 'notYet', 'solid', 'partly'])).toEqual({ level: 2, run: -1 })
  })

  test('holds a new level for two answers before stepping again', () => {
    expect(steps({ level: 1, run: 0 }, ['solid', 'solid', 'solid'])).toEqual({ level: 2, run: 1 })
    expect(steps({ level: 1, run: 0 }, ['solid', 'solid', 'solid', 'solid'])).toEqual({ level: 3, run: 0 })
  })

  test('stays within 1 to 3', () => {
    expect(steps({ level: 3, run: 0 }, ['solid', 'solid', 'solid'])).toEqual({ level: 3, run: 3 })
    expect(steps({ level: 1, run: 0 }, ['notYet', 'notYet', 'notYet'])).toEqual({ level: 1, run: -3 })
  })

  test('a miss at the top steps down only after a second one', () => {
    expect(steps({ level: 3, run: 3 }, ['notYet'])).toEqual({ level: 3, run: -1 })
    expect(steps({ level: 3, run: 3 }, ['notYet', 'notYet'])).toEqual({ level: 2, run: 0 })
  })
})

import { describe, expect, test } from 'claude-code/testing'

import { CAT_ROWS, CAT_WIDTH, catCells, catPosition, catSprite } from '../hooks/cat'

const decode = (b64: string) => Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))

describe('the walking cat', () => {
  test('fills exactly the raster it is drawn in', () => {
    const bytes = decode(catCells(40, 3))
    expect(bytes.length).toBe(40 * CAT_ROWS * 3 * 4)
  })

  test('walks to the far edge, turns around, and comes back', () => {
    const track = 40 - CAT_WIDTH
    expect(catPosition(0, track)).toEqual({ x: 0, right: true })
    expect(catPosition(track, track)).toEqual({ x: track, right: false })
    expect(catPosition(2 * track, track)).toEqual({ x: 0, right: true })
  })

  test('faces the way it walks and moves its legs every step', () => {
    expect(catSprite(0, false)[0]).toBe([...catSprite(0, true)[0]!].reverse().join(''))
    expect(catSprite(0, true).at(-1)).not.toBe(catSprite(1, true).at(-1))
  })

  test('a pane narrower than the cat still draws', () => {
    expect(decode(catCells(10, 0)).length).toBe(10 * CAT_ROWS * 3 * 4)
  })
})

import type { Difficulty, Level, Verdict } from '../types'

// A miss is anything short of Solid, as for Go deeper.
const isSolid = (v: Verdict) => v === 'solid'

// Most of the last 5 answers decide where a session starts; a thin record
// starts in the middle.
export function startLevel(recent: Verdict[]): Level {
  const last = recent.slice(-5)
  const solid = last.filter(isSolid).length
  if (solid >= 4) return 3
  if (last.length - solid >= 4) return 1
  return 2
}

// `run` counts Solid answers in a row as positive and misses as negative.
// It restarts after each step, so a level holds for at least two answers.
export function stepLevel(d: Difficulty, verdict: Verdict): Difficulty {
  const run = isSolid(verdict) ? Math.max(d.run, 0) + 1 : Math.min(d.run, 0) - 1
  if (run >= 2 && d.level < 3) return { level: (d.level + 1) as Level, run: 0 }
  if (run <= -2 && d.level > 1) return { level: (d.level - 1) as Level, run: 0 }
  return { level: d.level, run }
}

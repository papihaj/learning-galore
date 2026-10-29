// A missed question comes back after a gap that grows each time it is
// answered well, because recall after a pause is what makes an idea last.

import type { ReviewItem, Verdict } from '../types'

// Days until the next review, in order. A miss starts over at the first.
export const INTERVALS = [1, 3, 7, 21]
export const QUEUE_MAX = 50

// Local date, so a day ends at the person's midnight, not UTC's.
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function addDays(day: string, n: number): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number)
  return dayKey(new Date(y, m - 1, d + n))
}

// The next state of `item` after an answer, or undefined when there is
// nothing left to review: a fresh question answered well (interval 0), or
// one answered well at the last interval.
export function schedule(item: ReviewItem, verdict: Verdict, today: string): ReviewItem | undefined {
  if (verdict !== 'solid') return { ...item, interval: INTERVALS[0] ?? 1, due: addDays(today, INTERVALS[0] ?? 1) }
  const next = INTERVALS[INTERVALS.indexOf(item.interval) + 1]
  if (item.interval === 0 || next === undefined) return undefined
  return { ...item, interval: next, due: addDays(today, next) }
}

// Dates are YYYY-MM-DD, so string order is date order.
export const dueItems = (queue: ReviewItem[], today: string) =>
  queue.filter(r => r.due <= today).sort((a, b) => a.due.localeCompare(b.due))

// The most overdue item, or undefined when none is due.
export const pickDue = (queue: ReviewItem[], today: string): ReviewItem | undefined => dueItems(queue, today)[0]

// Puts `item` in place of any item with the same question, or takes it out
// when `item` is undefined. Over the cap, the items due last go first.
export function upsert(queue: ReviewItem[], question: string, item: ReviewItem | undefined): ReviewItem[] {
  const rest = queue.filter(r => r.question !== question)
  if (item === undefined) return rest
  return [...rest, item].sort((a, b) => a.due.localeCompare(b.due)).slice(0, QUEUE_MAX)
}

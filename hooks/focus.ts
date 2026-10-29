export const FOCUS_MAX = 5
const TOPIC_CHARS = 60

// "SQL indexes, React effects" becomes two topics. A repeat in other case
// counts once, so the list never spends a slot on the same topic twice.
export function parseFocus(args: string): string[] {
  const topics: string[] = []
  for (const part of args.split(',')) {
    const topic = part.trim().replace(/\s+/g, ' ').slice(0, TOPIC_CHARS)
    if (topic !== '' && !topics.some(t => t.toLowerCase() === topic.toLowerCase())) topics.push(topic)
  }
  return topics
}

// The model may name a topic that was never saved; show only a saved one,
// in the person's own spelling.
export function checkFocus(given: unknown, topics: string[]): string {
  if (typeof given !== 'string') return ''
  const wanted = given.trim().toLowerCase()
  return topics.find(t => t.toLowerCase() === wanted) ?? ''
}

// A linked question has to say how the session's idea lands in the area. The
// bridge phrase must show up in the question itself, or the link is only a label.
export function checkLink(given: unknown, bridge: unknown, question: string, topics: string[]): string {
  const area = checkFocus(given, topics)
  if (area === '' || typeof bridge !== 'string') return ''
  const words = bridge.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []
  const text = question.toLowerCase()
  if (!words.some(w => text.includes(w))) return ''
  const phrase = bridge.trim().replace(/\s+/g, ' ')
  // Cut at a word so a long bridge never ends mid-word.
  const short = phrase.length <= TOPIC_CHARS ? phrase : phrase.slice(0, TOPIC_CHARS).replace(/\s+\S*$/, '')
  return `${area} (${short})`
}

export const CHECKIN_EVERY = 50
export const CHECKIN_TOPICS = 6
const PREF_MAX = 10

export type TopicPrefs = { more: string[]; less: string[] }
export type Pick = 'more' | 'less'

export const topicKey = (topic: unknown): string =>
  typeof topic === 'string' ? topic.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40) : ''

export function tallyTopic(tally: Record<string, number>, topic: unknown): Record<string, number> {
  const key = topicKey(topic)
  return key === '' ? tally : { ...tally, [key]: (tally[key] ?? 0) + 1 }
}

// Most asked first; ties keep the order they were first seen.
export const topTopics = (tally: Record<string, number>, n = CHECKIN_TOPICS): string[] =>
  Object.entries(tally)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([topic]) => topic)

// A newer pick wins: asking for more of a topic takes it off the "less" list.
export function applyPicks(prefs: TopicPrefs, picks: Record<string, Pick>): TopicPrefs {
  let { more, less } = prefs
  for (const [topic, pick] of Object.entries(picks)) {
    more = more.filter(t => t !== topic)
    less = less.filter(t => t !== topic)
    if (pick === 'more') more = [topic, ...more]
    else less = [topic, ...less]
  }
  return { more: more.slice(0, PREF_MAX), less: less.slice(0, PREF_MAX) }
}

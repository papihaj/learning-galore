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

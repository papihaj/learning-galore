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

// The model may name an area that was never saved, or claim a link the
// question never makes: keep only a saved area, in the person's own spelling,
// whose bridge phrase shows up in the question itself.
export function checkLink(given: unknown, bridge: unknown, question: string, topics: string[]): string {
  if (typeof given !== 'string' || typeof bridge !== 'string') return ''
  const area = topics.find(t => t.toLowerCase() === given.trim().toLowerCase())
  const words = bridge.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []
  if (area === undefined || !words.some(w => question.toLowerCase().includes(w))) return ''
  const phrase = bridge.trim().replace(/\s+/g, ' ')
  // Cut at a word so a long bridge never ends mid-word.
  const short = phrase.length <= TOPIC_CHARS ? phrase : phrase.slice(0, TOPIC_CHARS).replace(/\s+\S*$/, '')
  return `${area} (${short})`
}

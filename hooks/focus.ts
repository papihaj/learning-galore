const TOPIC_CHARS = 60

export function parseFocus(args: string): string[] {
  const topics: string[] = []
  for (const part of args.split(',')) {
    const topic = part.trim().replace(/\s+/g, ' ').slice(0, TOPIC_CHARS)
    if (topic !== '' && !topics.some(t => t.toLowerCase() === topic.toLowerCase())) topics.push(topic)
  }
  return topics
}

export function checkLink(given: unknown, bridge: unknown, question: string, topics: string[]): string {
  if (typeof given !== 'string' || typeof bridge !== 'string') return ''
  const area = topics.find(t => t.toLowerCase() === given.trim().toLowerCase())
  const words = bridge.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? []
  if (area === undefined || !words.some(w => question.toLowerCase().includes(w))) return ''
  const phrase = bridge.trim().replace(/\s+/g, ' ')
  const short = phrase.length <= TOPIC_CHARS ? phrase : phrase.slice(0, TOPIC_CHARS).replace(/\s+\S*$/, '')
  return `${area} (${short})`
}

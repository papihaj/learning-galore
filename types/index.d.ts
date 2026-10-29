export type Format = 'free' | 'choice'

export type Verdict = 'solid' | 'partly' | 'notYet'

export type Quiz = {
  status: 'idle' | 'thinking' | 'asking' | 'grading' | 'answered' | 'teaching' | 'taught' | 'error'
  format: Format
  question: string
  choices: string[]
  correct: number
  selected: number
  explanation: string
  answer: string
  feedback: string
  verdict?: Verdict
  lesson: string
  error: string
  source: string
  focus: string
  term: string
  definition: string
}

// One answered question, kept on disk in <project>/learning-galore-notes.
// `day` is the local date (YYYY-MM-DD); `right` is set for multiple choice.
export type Note = {
  day: string
  question: string
  term: string
  definition: string
  answer: string
  verdict: Verdict | 'ungraded'
  feedback: string
  source?: string
  right?: string
}

declare module 'claude-code' {
  interface PluginState {
    'session-quiz': {
      quiz: Shaped<Quiz>
      format: Shaped<Format>
      asked: Shaped<string[]>
      showSettings: Shaped<boolean>
      sessionTokens: Shaped<number>
      petStep: Shaped<number>
    }
  }
}

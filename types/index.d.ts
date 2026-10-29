export type Format = 'free' | 'choice'

export type Quiz = {
  status: 'idle' | 'thinking' | 'asking' | 'grading' | 'answered' | 'teaching' | 'taught' | 'error'
  format: Format
  question: string
  choices: string[]
  correct: number
  selected: number
  explanation: string
  answer: string
  draft: string
  feedback: string
  lesson: string
  error: string
  source: string
  focus: string
  topic: string
}

export type QuizUsage = { tokens: number; questions: number }

export type QuizSettings = { format: Format }

// Tokens spent per local day (YYYY-MM-DD), kept in $.store for the Settings view.
export type TokenLog = Record<string, number>

export type Verdict = 'solid' | 'partly' | 'notYet'

// One answered question, kept on disk in <project>/learning-galore-notes.
// `day` is the local date (YYYY-MM-DD); `right` is set for multiple choice.
export type Note = {
  day: string
  question: string
  topic: string
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
      usage: Shaped<QuizUsage>
      settings: Shaped<QuizSettings>
      asked: Shaped<string[]>
      showSettings: Shaped<boolean>
      tokenLog: Shaped<TokenLog>
    }
  }
}

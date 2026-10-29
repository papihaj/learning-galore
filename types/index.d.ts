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
}

export type QuizUsage = { tokens: number; questions: number }

export type QuizSettings = { format: Format }

// Tokens spent per local day (YYYY-MM-DD), kept in $.store for the Settings view.
export type TokenLog = Record<string, number>

export type Verdict = 'solid' | 'partly' | 'notYet'

// Kept in $.store across sessions; mirrored here so the pane redraws.
// `lastDay` is the local date (YYYY-MM-DD) of the latest answer.
export type QuizStats = Record<Verdict, number> & {
  answered: number
  streak: number
  best: number
  lastDay: string
}

// One answered question, kept in $.store for /quiz log and /quiz anki.
// `day` is the local date (YYYY-MM-DD) it was answered. `choices` and `right`
// are set for multiple choice only, `source` only when the question named one.
export type LogRecord = {
  day: string
  question: string
  format: Format
  answer: string
  verdict: Verdict | 'ungraded'
  feedback: string
  source?: string
  choices?: string[]
  right?: string
}

declare module 'claude-code' {
  interface PluginState {
    'session-quiz': {
      quiz: Shaped<Quiz>
      usage: Shaped<QuizUsage>
      settings: Shaped<QuizSettings>
      asked: Shaped<string[]>
      stats: Shaped<QuizStats>
      showSettings: Shaped<boolean>
      tokenLog: Shaped<TokenLog>
    }
  }
}

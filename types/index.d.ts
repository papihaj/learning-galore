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

export type Level = 1 | 2 | 3

// `auto` lets the level step with the answers; a number pins it.
export type QuizSettings = { format: Format; budget: number; maxQuestions: number; level: Level | 'auto' }

export type Verdict = 'solid' | 'partly' | 'notYet'

// Kept in $.store across sessions; mirrored here so the pane redraws.
// `lastDay` is the local date (YYYY-MM-DD) of the latest answer.
export type QuizStats = Record<Verdict, number> & {
  answered: number
  streak: number
  best: number
  lastDay: string
}

// This session's level. `run` is the Solid answers in a row, or the misses in
// a row as a negative number. Null until the session sets it.
export type Difficulty = { level: Level; run: number }

declare module 'claude-code' {
  interface PluginState {
    'session-quiz': {
      quiz: Shaped<Quiz>
      usage: Shaped<QuizUsage>
      settings: Shaped<QuizSettings>
      asked: Shaped<string[]>
      stats: Shaped<QuizStats>
      difficulty: Shaped<Difficulty | null>
    }
  }
}

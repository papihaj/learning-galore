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
  // The day a review item was first missed; empty for a new question.
  reviewFrom: string
}

export type QuizUsage = { tokens: number; questions: number }

export type QuizSettings = { format: Format; budget: number; maxQuestions: number }

export type Verdict = 'solid' | 'partly' | 'notYet'

// Kept in $.store across sessions; mirrored here so the pane redraws.
// `lastDay` is the local date (YYYY-MM-DD) of the latest answer.
export type QuizStats = Record<Verdict, number> & {
  answered: number
  streak: number
  best: number
  lastDay: string
}

// A missed question kept in $.store for spaced review. `choices` lists the
// right one first, as the model wrote it; the pane shuffles them each time.
// `interval` is the days until `due` (YYYY-MM-DD), 0 for a question never missed.
export type ReviewItem = {
  question: string
  format: Format
  choices: string[]
  explanation: string
  source: string
  added: string
  interval: number
  due: string
}

declare module 'claude-code' {
  interface PluginState {
    'session-quiz': {
      quiz: Shaped<Quiz>
      usage: Shaped<QuizUsage>
      settings: Shaped<QuizSettings>
      asked: Shaped<string[]>
      stats: Shaped<QuizStats>
    }
  }
}

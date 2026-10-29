export type Format = 'free' | 'choice'

export type Quiz = {
  status: 'idle' | 'thinking' | 'asking' | 'grading' | 'answered' | 'error'
  format: Format
  question: string
  choices: string[]
  correct: number
  selected: number
  explanation: string
  answer: string
  draft: string
  feedback: string
  error: string
}

export type QuizUsage = { tokens: number; questions: number }

export type QuizSettings = { format: Format; budget: number; maxQuestions: number }

declare module 'claude-code' {
  interface PluginState {
    'session-quiz': {
      quiz: Shaped<Quiz>
      usage: Shaped<QuizUsage>
      settings: Shaped<QuizSettings>
      asked: Shaped<string[]>
    }
  }
}

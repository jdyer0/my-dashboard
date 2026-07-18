export interface Exercise {
  id: string
  name: string
  created_at: string
  increment_kg: number
  rep_range_min: number
  rep_range_max: number
}

export type SplitFocus = 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full_body' | 'rest'

export interface SplitDay {
  /** 0 = Monday … 6 = Sunday. */
  weekday: number
  focus: SplitFocus
}

export interface SplitTemplateExercise {
  id: string
  focus: Exclude<SplitFocus, 'rest'>
  exercise_id: string
  position: number
}

export interface GymSession {
  id: string
  started_at: string
  ended_at: string | null
}

export interface GymSet {
  id: string
  session_id: string
  exercise_id: string
  weight_kg: number
  reps: number
  performed_at: string
}

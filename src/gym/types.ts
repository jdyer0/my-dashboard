export interface Exercise {
  id: string
  name: string
  created_at: string
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

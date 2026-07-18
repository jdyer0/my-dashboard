import { supabase } from '../lib/supabase'
import type {
  Exercise,
  GymSession,
  GymSet,
  SplitDay,
  SplitFocus,
  SplitTemplateExercise,
} from './types'

const EXERCISE_COLS = 'id, name, created_at, increment_kg, rep_range_min, rep_range_max'
const SESSION_COLS = 'id, started_at, ended_at'
const SET_COLS = 'id, session_id, exercise_id, weight_kg, reps, performed_at'

async function userId(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user.id
  if (!id) throw new Error('Signed out')
  return id
}

export async function listExercises(): Promise<Exercise[]> {
  const { data, error } = await supabase.from('exercises').select(EXERCISE_COLS).order('name')
  if (error) throw error
  return data
}

export async function addExercise(name: string): Promise<Exercise> {
  const { data, error } = await supabase
    .from('exercises')
    .insert({ user_id: await userId(), name: name.trim() })
    .select(EXERCISE_COLS)
    .single()
  if (error) throw error
  return data
}

/** All sessions, newest first. The active one (ended_at null) is included. */
export async function listSessions(): Promise<GymSession[]> {
  const { data, error } = await supabase
    .from('gym_sessions')
    .select(SESSION_COLS)
    .order('started_at', { ascending: false })
  if (error) throw error
  return data
}

export async function fetchSession(id: string): Promise<GymSession | null> {
  const { data, error } = await supabase
    .from('gym_sessions')
    .select(SESSION_COLS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function fetchActiveSession(): Promise<GymSession | null> {
  const { data, error } = await supabase
    .from('gym_sessions')
    .select(SESSION_COLS)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function startSession(): Promise<GymSession> {
  const { data, error } = await supabase
    .from('gym_sessions')
    .insert({ user_id: await userId() })
    .select(SESSION_COLS)
    .single()
  if (error) throw error
  return data
}

export async function finishSession(id: string): Promise<void> {
  const { error } = await supabase
    .from('gym_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteSession(id: string): Promise<void> {
  const { error } = await supabase.from('gym_sessions').delete().eq('id', id)
  if (error) throw error
}

/** Every set the user has ever logged — feeds bests, PR baselines and prefill.
    Single user, a few thousand rows a year: one query is cheaper than paging. */
export async function listAllSets(): Promise<GymSet[]> {
  const { data, error } = await supabase.from('gym_sets').select(SET_COLS).order('performed_at')
  if (error) throw error
  return data
}

export async function addSet(
  sessionId: string,
  exerciseId: string,
  weightKg: number,
  reps: number,
): Promise<GymSet> {
  const { data, error } = await supabase
    .from('gym_sets')
    .insert({
      user_id: await userId(),
      session_id: sessionId,
      exercise_id: exerciseId,
      weight_kg: weightKg,
      reps,
    })
    .select(SET_COLS)
    .single()
  if (error) throw error
  return data
}

export async function deleteSet(id: string): Promise<void> {
  const { error } = await supabase.from('gym_sets').delete().eq('id', id)
  if (error) throw error
}

export async function updateExerciseSettings(
  id: string,
  settings: { increment_kg: number; rep_range_min: number; rep_range_max: number },
): Promise<void> {
  const { error } = await supabase.from('exercises').update(settings).eq('id', id)
  if (error) throw error
}

export async function fetchSplitDays(): Promise<SplitDay[]> {
  const { data, error } = await supabase
    .from('split_days')
    .select('weekday, focus')
    .order('weekday')
  if (error) throw error
  return data
}

export async function setSplitDay(weekday: number, focus: SplitFocus): Promise<void> {
  const { error } = await supabase
    .from('split_days')
    .upsert({ user_id: await userId(), weekday, focus }, { onConflict: 'user_id,weekday' })
  if (error) throw error
}

export async function fetchSplitTemplates(): Promise<SplitTemplateExercise[]> {
  const { data, error } = await supabase
    .from('split_template_exercises')
    .select('id, focus, exercise_id, position')
    .order('position')
  if (error) throw error
  return data
}

export async function addSplitTemplateExercise(
  focus: Exclude<SplitFocus, 'rest'>,
  exerciseId: string,
  position: number,
): Promise<SplitTemplateExercise> {
  const { data, error } = await supabase
    .from('split_template_exercises')
    .insert({ user_id: await userId(), focus, exercise_id: exerciseId, position })
    .select('id, focus, exercise_id, position')
    .single()
  if (error) throw error
  return data
}

export async function removeSplitTemplateExercise(id: string): Promise<void> {
  const { error } = await supabase.from('split_template_exercises').delete().eq('id', id)
  if (error) throw error
}

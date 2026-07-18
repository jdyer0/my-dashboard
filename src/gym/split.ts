import type { SplitFocus } from './types'

export const FOCUS_LABELS: Record<SplitFocus, string> = {
  upper: 'Upper',
  lower: 'Lower',
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  full_body: 'Full body',
  rest: 'Rest',
}

export const FOCUS_OPTIONS: SplitFocus[] = [
  'upper',
  'lower',
  'push',
  'pull',
  'legs',
  'full_body',
  'rest',
]

export const TEMPLATE_FOCUSES: Exclude<SplitFocus, 'rest'>[] = [
  'upper',
  'lower',
  'push',
  'pull',
  'legs',
  'full_body',
]

export const WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function isTemplateFocus(value: string): value is Exclude<SplitFocus, 'rest'> {
  return (TEMPLATE_FOCUSES as string[]).includes(value)
}

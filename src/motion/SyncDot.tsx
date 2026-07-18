import { usePrefersReducedMotion } from './usePrefersReducedMotion'

export type SyncState = 'synced' | 'syncing' | 'stale' | 'error'

const tone: Record<SyncState, string> = {
  synced: 'bg-live',
  syncing: 'bg-live',
  stale: 'bg-warn',
  error: 'bg-alert',
}

const label: Record<SyncState, string> = {
  synced: 'Synced',
  syncing: 'Syncing',
  stale: 'Sync is stale',
  error: 'Sync failed',
}

/** The 2s opacity pulse — the only perpetual animation in the app. */
export function SyncDot({ state, className = '' }: { state: SyncState; className?: string }) {
  const reduced = usePrefersReducedMotion()
  const pulse = !reduced && (state === 'synced' || state === 'syncing')

  return (
    <span
      role="status"
      aria-label={label[state]}
      className={`inline-block h-1.5 w-1.5 rounded-full ${tone[state]} ${
        pulse ? 'animate-pulse-sync' : ''
      } ${className}`}
    />
  )
}

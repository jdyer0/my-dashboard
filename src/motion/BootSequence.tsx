import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface BootContextValue {
  animate: boolean
  register: (id: string) => number
}

const BootContext = createContext<BootContextValue>({ animate: false, register: () => 0 })
const BootDelayContext = createContext(0)
const BootGuardContext = createContext<MutableRefObject<boolean> | null>(null)

/**
 * Lives at the app root, above the router. Its ref records that the boot
 * sequence has run once this page load, so a tab switch back to the dashboard
 * renders everything in its settled state instead of re-booting.
 */
export function BootGuardProvider({ children }: { children: ReactNode }) {
  const hasBooted = useRef(false)
  return <BootGuardContext.Provider value={hasBooted}>{children}</BootGuardContext.Provider>
}

const STAGGER_MS = 60

/**
 * Orchestrates the mount cascade. Children register via <BootItem> and receive
 * a delay index in render order. The animate decision is taken once, on mount,
 * and never changes for the life of the instance.
 */
export function BootSequence({ children }: { children: ReactNode }) {
  const guard = useContext(BootGuardContext)
  const reduced = usePrefersReducedMotion()

  const animateRef = useRef<boolean | null>(null)
  if (animateRef.current === null) {
    animateRef.current = !reduced && (guard ? !guard.current : true)
  }
  const animate = animateRef.current

  useEffect(() => {
    if (guard) guard.current = true
  }, [guard])

  // Registration is keyed by useId so React StrictMode's double render
  // can't double-count an item.
  const order = useRef<Map<string, number>>(new Map())
  const register = useCallback((id: string) => {
    const seen = order.current
    let index = seen.get(id)
    if (index === undefined) {
      index = seen.size
      seen.set(id, index)
    }
    return index
  }, [])

  const value = useMemo(() => ({ animate, register }), [animate, register])
  return <BootContext.Provider value={value}>{children}</BootContext.Provider>
}

/**
 * One card or tile in the cascade. Applies the translate/opacity entrance with
 * its stagger delay, and exposes that delay to CountUp/Sparkline/Bar children
 * so their animations start as the card lands.
 */
export function BootItem({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  const { animate, register } = useContext(BootContext)
  const id = useId()
  const delay = animate ? register(id) * STAGGER_MS : 0

  return (
    <BootDelayContext.Provider value={delay}>
      <div
        className={animate ? `animate-boot-in ${className}` : className}
        style={animate ? { animationDelay: `${delay}ms` } : undefined}
      >
        {children}
      </div>
    </BootDelayContext.Provider>
  )
}

/** True when the enclosing BootSequence is running its mount animation. */
// eslint-disable-next-line react-refresh/only-export-components -- context hooks live with their provider
export function useBootAnimate(): boolean {
  return useContext(BootContext).animate
}

/** Stagger delay (ms) of the enclosing BootItem; 0 outside a boot or after it. */
// eslint-disable-next-line react-refresh/only-export-components -- context hooks live with their provider
export function useBootDelay(): number {
  return useContext(BootDelayContext)
}

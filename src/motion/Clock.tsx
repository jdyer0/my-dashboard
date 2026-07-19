import { useEffect, useState } from 'react'

const format = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/London',
})

/**
 * Live HH:MM:SS readout. The tick is content, not decoration, so it keeps
 * running under prefers-reduced-motion — nothing moves, a value updates.
 */
export function Clock({ className = '' }: { className?: string }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <time className={`font-mono tabular-nums ${className}`} dateTime={now.toISOString()}>
      {format.format(now)}
    </time>
  )
}

/** Neutral hold while the session resolves — neither sign-in nor shell flashes. */
export function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas">
      <span className="h-1.5 w-1.5 rounded-full bg-ink-faint" aria-hidden="true" />
    </div>
  )
}

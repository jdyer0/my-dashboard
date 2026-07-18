import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Phase = 'idle' | 'sending' | 'sent' | 'error'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!email || phase === 'sending') return
    setPhase('sending')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin,
        // Single-user app: the user exists already, created in the Supabase
        // dashboard. Never create accounts from the sign-in form.
        shouldCreateUser: false,
      },
    })
    setPhase(error ? 'error' : 'sent')
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-6 pb-safe">
      <form onSubmit={submit} className="w-full max-w-xs space-y-4">
        <h1 className="text-screen-title text-ink">Sign in</h1>

        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-label text-ink-faint">
            Email
          </label>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-body text-ink focus:border-line-bright"
          />
        </div>

        <button
          type="submit"
          disabled={phase === 'sending'}
          className="h-11 w-full rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
        >
          {phase === 'sending' ? 'Sending' : 'Send sign-in link'}
        </button>

        {phase === 'sent' && <p className="text-body text-ink-dim">Link sent. Check your email.</p>}
        {phase === 'error' && (
          <p className="text-body text-alert">Sign-in failed. Check the address and try again.</p>
        )}
      </form>
    </div>
  )
}

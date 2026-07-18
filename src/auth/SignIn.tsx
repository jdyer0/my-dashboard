import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!email || !password || pending) return
    setPending(true)
    setFailed(false)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    // On success the AuthProvider listener swaps the gate to the shell;
    // this screen unmounts, so only the failure case needs handling here.
    setPending(false)
    setFailed(Boolean(error))
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

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-label text-ink-faint">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-ctl border border-line bg-surface px-3 text-body text-ink focus:border-line-bright"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-ctl border border-line bg-surface-raised text-body text-ink transition-transform duration-150 ease-instrument active:scale-[0.98] disabled:text-ink-faint"
        >
          {pending ? 'Signing in' : 'Sign in'}
        </button>

        {failed && (
          <p className="text-body text-alert">Sign-in failed. Check your email and password.</p>
        )}
      </form>
    </div>
  )
}

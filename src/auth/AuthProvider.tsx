import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type AuthState =
  { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; session: Session }

const AuthContext = createContext<AuthState>({ status: 'loading' })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState(
        data.session ? { status: 'signed-in', session: data.session } : { status: 'signed-out' },
      )
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? { status: 'signed-in', session } : { status: 'signed-out' })
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components -- context hook lives with its provider
export function useAuth() {
  return useContext(AuthContext)
}

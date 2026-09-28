import { useState } from 'react'
import { Plane } from 'lucide-react'
import { useAuth } from '@/lib/auth'

export function SignIn() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const err =
      mode === 'signin'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password)
    setError(err)
    setBusy(false)
  }

  const switchMode = (m: 'signin' | 'signup') => {
    setMode(m)
    setError(null)
  }

  const isSignup = mode === 'signup'

  return (
    <div className="flex min-h-dvh items-center justify-center bg-sky-50 p-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm"
      >
        <div className="mb-1 flex items-center gap-2">
          <Plane className="h-6 w-6 text-brand-600" />
          <h1 className="text-xl font-semibold">Travel</h1>
        </div>
        <p className="mb-6 text-sm text-slate-500">
          {isSignup ? 'Create an account to get started.' : 'Sign in to see your trips.'}
        </p>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
            autoComplete="email"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Password</span>
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
          />
        </label>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand-600 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? (isSignup ? 'Creating account…' : 'Signing in…') : isSignup ? 'Create account' : 'Sign in'}
        </button>
        <p className="mt-4 text-center text-sm text-slate-500">
          {isSignup ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="font-medium text-brand-600 hover:underline"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              New here?{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="font-medium text-brand-600 hover:underline"
              >
                Create an account
              </button>
            </>
          )}
        </p>
      </form>
    </div>
  )
}

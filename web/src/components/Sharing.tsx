// Screen — trip sharing: owner + members, claim ownerless trips, invite by
// email. Only the owner can add/remove members.

import { useCallback, useEffect, useState } from 'react'
import { Trash2, UserPlus } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import * as api from '@/lib/api'
import { ApiError } from '@/lib/api'
import type { MembersResponse, Trip, TripInvite, TripMember } from '@/types'

interface Props {
  trips: Trip[]
  selectedTripId: string | null
  onSelectTrip: (id: string) => void
  token: string | null
  seedMode: boolean
  onTripClaimed: (trip: Trip) => void
}

const ROLE_BADGE: Record<string, string> = {
  owner: 'bg-brand-100 text-brand-700',
  editor: 'bg-sky-100 text-sky-700',
  viewer: 'bg-slate-100 text-slate-600',
}

export function Sharing({ trips, selectedTripId, onSelectTrip, token, seedMode, onTripClaimed }: Props) {
  const { session } = useAuth()
  const trip = trips.find((t) => t.id === selectedTripId) ?? null
  const myId = session?.user.id ?? null

  const [data, setData] = useState<MembersResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!token || !trip || seedMode) {
      setData(null)
      return
    }
    setLoading(true)
    try {
      const d = await api.listMembers(token, trip.id)
      setData(d)
      setError(null)
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [token, trip, seedMode])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const isOwner = data?.owner_id != null && myId != null && data.owner_id === myId

  const claim = async () => {
    if (!token || !trip) return
    setBusy(true)
    setError(null)
    try {
      const updated = await api.claimTrip(token, trip.id)
      onTripClaimed(updated)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to claim trip')
    } finally {
      setBusy(false)
    }
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !trip) return
    setBusy(true)
    setError(null)
    try {
      await api.addMember(token, trip.id, { email: email.trim(), role })
      setEmail('')
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to add member')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (m: TripMember) => {
    if (!token || !trip) return
    if (!window.confirm(`Remove ${m.email ?? 'this member'} from "${trip.name}"?`)) return
    setError(null)
    try {
      await api.removeMember(token, trip.id, m.user_id)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove member')
    }
  }

  const removePending = async (inv: TripInvite) => {
    if (!token || !trip) return
    if (!window.confirm(`Cancel the invite for ${inv.email}?`)) return
    setError(null)
    try {
      await api.removeInvite(token, trip.id, inv.id)
      await refresh()
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'Failed to cancel invite')
    }
  }

  const labelFor = (m: TripMember) =>
    m.email ?? (m.user_id === myId ? (session?.user.email ?? 'you') : `user ${m.user_id.slice(0, 8)}`)

  return (
    <div>
      <select
        value={selectedTripId ?? ''}
        onChange={(e) => onSelectTrip(e.target.value)}
        className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        aria-label="Select trip"
      >
        <option value="" disabled>
          Select a trip…
        </option>
        {trips.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      {!trip ? (
        <p className="rounded-lg bg-white p-4 text-center text-sm text-slate-500 shadow-sm">
          Select a trip to manage sharing.
        </p>
      ) : seedMode ? (
        <p className="rounded-lg bg-white p-4 text-center text-sm text-slate-500 shadow-sm">
          Sharing is disabled for sample data.
        </p>
      ) : (
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-1 text-base font-semibold">Sharing</h2>
          <p className="mb-4 text-sm text-slate-500">{trip.name}</p>

          {loading && !data ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <>
              {data?.owner_id == null && (
                <div className="mb-4 rounded-lg bg-amber-50 p-3">
                  <p className="mb-2 text-sm text-amber-800">
                    This trip has no owner yet. Claim it to manage sharing.
                  </p>
                  <button
                    onClick={() => void claim()}
                    disabled={busy}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {busy ? 'Claiming…' : 'Claim this trip'}
                  </button>
                </div>
              )}

              <ul className="mb-4 space-y-2">
                {(data?.members ?? []).map((m) => (
                  <li
                    key={m.user_id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {labelFor(m)}
                        {m.user_id === myId && (
                          <span className="ml-1 text-xs font-normal text-slate-400">(you)</span>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_BADGE[m.role] ?? ROLE_BADGE.viewer}`}
                      >
                        {m.role}
                      </span>
                      {isOwner && m.user_id !== data?.owner_id && (
                        <button
                          onClick={() => void remove(m)}
                          aria-label={`Remove ${labelFor(m)}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
                {(data?.members.length ?? 0) === 0 && (data?.invites.length ?? 0) === 0 && (
                  <li className="text-sm text-slate-500">No members yet.</li>
                )}
                {(data?.invites ?? []).map((inv) => (
                  <li
                    key={`invite-${inv.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-600">
                        {inv.email}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_BADGE[inv.role] ?? ROLE_BADGE.viewer}`}
                      >
                        {inv.role}
                      </span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                        pending
                      </span>
                      {isOwner && (
                        <button
                          onClick={() => void removePending(inv)}
                          aria-label={`Cancel invite for ${inv.email}`}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {isOwner && data?.owner_id != null && (
                <form onSubmit={(e) => void add(e)} className="border-t border-slate-100 pt-4">
                  <h3 className="mb-2 flex items-center gap-1 text-sm font-medium text-slate-700">
                    <UserPlus className="h-4 w-4" /> Invite someone
                  </h3>
                  <p className="mb-3 text-xs text-slate-500">
                    If they don't have an account yet, invite them anyway — they'll be
                    added automatically the first time they sign in with that email.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address"
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
                    />
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      aria-label="Role"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      type="submit"
                      disabled={busy}
                      className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {busy ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      )}
    </div>
  )
}

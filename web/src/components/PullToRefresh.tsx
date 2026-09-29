// PullToRefresh — drag down from the top of the screen to force a data
// reload (e.g. to pick up bookings someone else added to a shared trip).
// Touch-only; the home-screen PWA has no native pull-to-refresh.

import { useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

const THRESHOLD = 80
const MAX_PULL = 120

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<void>
  children: React.ReactNode
}) {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY > 0 || refreshing) return
    startY.current = e.touches[0].clientY
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current == null || refreshing) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 0 && window.scrollY <= 0) setPull(Math.min(dy, MAX_PULL))
    else if (dy <= 0) setPull(0)
  }

  const endTouch = async () => {
    if (startY.current == null) return
    startY.current = null
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setPull(0)
      }
    } else {
      setPull(0)
    }
  }

  const active = pull > 0 || refreshing

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={endTouch}
      onTouchCancel={endTouch}
    >
      <div
        className="flex justify-center overflow-hidden transition-[height,opacity]"
        style={{ height: active ? 44 : 0, opacity: active ? 1 : 0 }}
        aria-hidden
      >
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <RefreshCw
            className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
            style={
              refreshing ? undefined : { transform: `rotate(${pull * 2.5}deg)` }
            }
          />
          {refreshing ? 'Refreshing…' : pull >= THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      </div>
      {children}
    </div>
  )
}

import { useEffect } from 'react'

/**
 * Keeps the screen awake while `active` is true, via the Screen Wake Lock API
 * (Chrome/Android, Safari iOS 16.4+). The lock is re-acquired when the tab
 * becomes visible again (the browser drops it on hide) and released on cleanup.
 * Unsupported browsers degrade silently — the screen just dims as usual.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        /* denied or unsupported — non-fatal, the screen just dims */
      }
    }

    const onVisibility = () => {
      if (!cancelled && document.visibilityState === 'visible') void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel?.release().catch(() => {})
    }
  }, [active])
}

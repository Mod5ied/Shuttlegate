import { useEffect, useState } from '@lynx-js/react'

export function useOnlineStatus() {
  const [online, setOnline] = useState(() => {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
      return navigator.onLine
    }
    return true
  })

  useEffect(() => {
    if (typeof globalThis === 'undefined') return

    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)

    globalThis.addEventListener?.('online', handleOnline)
    globalThis.addEventListener?.('offline', handleOffline)

    return () => {
      globalThis.removeEventListener?.('online', handleOnline)
      globalThis.removeEventListener?.('offline', handleOffline)
    }
  }, [])

  const markOffline = () => setOnline(false)

  return { online, markOffline }
}

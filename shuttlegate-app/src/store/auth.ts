import { useEffect, useState } from '@lynx-js/react'
import { getSecureItem, setSecureItem, deleteSecureItem } from '../lib/secureStorage.js'
import type { User } from '@shuttlegate/types'

interface AuthState {
  token: string | null
  user: User | null
}

const TOKEN_KEY = 'shuttlegate_auth_token'
const USER_KEY = 'shuttlegate_auth_user'

let state: AuthState = { token: null, user: null }
const listeners = new Set<() => void>()
let initialized = false

function notify(): void {
  listeners.forEach((listener) => listener())
}

export function getAuth(): AuthState {
  return state
}

export async function setAuth(next: AuthState): Promise<void> {
  state = next
  if (next.token) {
    await setSecureItem(TOKEN_KEY, next.token)
    await setSecureItem(USER_KEY, JSON.stringify(next.user))
  } else {
    await deleteSecureItem(TOKEN_KEY)
    await deleteSecureItem(USER_KEY)
  }
  notify()
}

export async function initAuth(): Promise<void> {
  if (initialized) return
  initialized = true

  const token = await getSecureItem(TOKEN_KEY)
  const userJson = await getSecureItem(USER_KEY)
  if (token && userJson) {
    try {
      const user = JSON.parse(userJson) as User
      state = { token, user }
      notify()
    } catch {
      await deleteSecureItem(TOKEN_KEY)
      await deleteSecureItem(USER_KEY)
    }
  }
}

export function useAuth(): AuthState {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return state
}

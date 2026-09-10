import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { getToken } from '../services/api'
import * as authService from '../services/auth'
import type { CurrentUser } from '../services/auth'

interface AuthContextValue {
  user: CurrentUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<CurrentUser>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadUser() {
      if (!getToken()) {
        setIsLoading(false)
        return
      }
      try {
        const me = await authService.getMe()
        if (!cancelled) setUser(me)
      } catch {
        authService.logout()
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadUser()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    await authService.login(email, password)
    const me = await authService.getMe()
    setUser(me)
    return me
  }, [])

  const logout = useCallback(() => {
    authService.logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}

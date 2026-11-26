import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import { api } from '../services/api'

import {
  AuthContext,
  type AuthenticatedUser,
} from './Auth-Context'
// Response structure returned by GET /auth/profile.
interface ProfileResponse {
  message: string
  user: AuthenticatedUser
}

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Retrieve the current user's profile from the backend.
  const refreshProfile = useCallback(async () => {
    const token = localStorage.getItem('token')

    if (!token) {
      setUser(null)
      return
    }

    const response = await api.get<ProfileResponse>('/auth/profile')
    setUser(response.data.user)
  }, [])

  // Check the saved session when the application starts.
  useEffect(() => {
    let isMounted = true

    const initializeAuth = async () => {
      const token = localStorage.getItem('token')

      if (!token) {
        if (isMounted) {
          setIsLoading(false)
        }
        return
      }

      try {
        const response = await api.get<ProfileResponse>('/auth/profile')

        if (isMounted) {
          setUser(response.data.user)
        }
      } catch (error) {
        // Only clear the token when the backend rejects it.
        if (
          typeof error === 'object' &&
          error !== null &&
          'response' in error &&
          error.response &&
          typeof error.response === 'object' &&
          'status' in error.response &&
          error.response.status === 401
        ) {
          localStorage.removeItem('token')

          if (isMounted) {
            setUser(null)
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void initializeAuth()

    return () => {
      isMounted = false
    }
  }, [])

  // End the current session.
  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        refreshProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

import { createContext } from 'react'

// Information returned by the backend's JWT authentication strategy.
export interface AuthenticatedUser {
  userId: string
  email: string
  role: string
}

// Values available throughout the application.
export interface AuthContextType {
  user: AuthenticatedUser | null
  isAuthenticated: boolean
  isLoading: boolean
  refreshProfile: () => Promise<void>
  logout: () => void
}

// Export the context so other files can import it.
export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
)
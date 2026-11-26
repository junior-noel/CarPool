
import { useContext } from 'react'
import { AuthContext } from '../context/Auth-Context'

// Convenient access to authentication state.
export function useAuth() {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}

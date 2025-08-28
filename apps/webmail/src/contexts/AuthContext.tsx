import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createCeerionMailClient } from '@ceerion/sdk'
import toast from 'react-hot-toast'

interface User {
  id: string
  email: string
  name: string
  role: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string, rememberMe?: boolean, mfaCode?: string) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<void>
  client: ReturnType<typeof createCeerionMailClient>
}

const AuthContext = createContext<AuthContextType | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

const TOKEN_KEY = 'ceerion_access_token'
const REFRESH_KEY = 'ceerion_refresh_token'

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [accessToken, setAccessToken] = useState<string | null>(null)

  // Create client that updates with current token
  const client = createCeerionMailClient({
    baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:4000',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  })

  const isAuthenticated = !!user && !!accessToken

  // Initialize auth state from storage
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      setAccessToken(token)
      // Verify token validity by getting user info
      verifyToken(token)
    } else {
      setIsLoading(false)
    }
  }, [])

  // Set up token refresh interval
  useEffect(() => {
    if (!accessToken) return

    // Refresh token every 45 minutes (tokens expire in 1 hour)
    const interval = setInterval(() => {
      refreshToken().catch(() => {
        // If refresh fails, logout user
        logout()
      })
    }, 45 * 60 * 1000)

    return () => clearInterval(interval)
  }, [accessToken])

  const verifyToken = async (token: string) => {
    try {
      // Create temporary client with token to verify
      const tempClient = createCeerionMailClient({
        baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:4000',
        headers: { Authorization: `Bearer ${token}` },
      })
      
      const response = await tempClient.settings.get()
      if (response.data) {
        // Mock user data since we don't have a /auth/me endpoint
        setUser({
          id: '1',
          email: 'user@example.com',
          name: 'User',
          role: 'user',
        })
      }
    } catch (error) {
      console.error('Token verification failed:', error)
      // Clear invalid token
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(REFRESH_KEY)
      setAccessToken(null)
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (email: string, password: string, rememberMe = false, mfaCode?: string) => {
    setIsLoading(true)
    try {
      const response = await client.auth.login({
        email,
        password,
        rememberMe,
        mfaCode,
      })

      if (response.data) {
        const { accessToken: newAccessToken, refreshToken } = response.data as any
        
        // Store tokens
        localStorage.setItem(TOKEN_KEY, newAccessToken)
        if (refreshToken) {
          localStorage.setItem(REFRESH_KEY, refreshToken)
        }
        
        setAccessToken(newAccessToken)
        
        // Set user data (mock for now)
        setUser({
          id: '1',
          email,
          name: email.split('@')[0],
          role: 'user',
        })

        toast.success('Successfully logged in!')
      }
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Login failed'
      toast.error(message)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    setIsLoading(true)
    try {
      // Try to logout on server
      await client.auth.logout()
    } catch (error) {
      // Continue with local logout even if server call fails
      console.error('Server logout failed:', error)
    }

    // Clear local state
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    setAccessToken(null)
    setUser(null)
    
    toast.success('Successfully logged out')
    setIsLoading(false)
  }

  const refreshToken = async () => {
    const storedRefreshToken = localStorage.getItem(REFRESH_KEY)
    if (!storedRefreshToken) {
      throw new Error('No refresh token available')
    }

    try {
      const response = await client.auth.refresh()
      
      if (response.data) {
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = response.data as any
        
        // Update stored tokens
        localStorage.setItem(TOKEN_KEY, newAccessToken)
        if (newRefreshToken) {
          localStorage.setItem(REFRESH_KEY, newRefreshToken)
        }
        
        setAccessToken(newAccessToken)
      }
    } catch (error) {
      console.error('Token refresh failed:', error)
      throw error
    }
  }

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    login,
    logout,
    refreshToken,
    client,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

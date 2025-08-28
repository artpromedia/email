import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: 'dark' | 'light'
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
  resolvedTheme: 'dark',
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

function getResolvedTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

function getStoredTheme(storageKey: string, defaultTheme: Theme): Theme {
  try {
    return (localStorage.getItem(storageKey) as Theme) || defaultTheme
  } catch {
    return defaultTheme
  }
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark', // Default to dark theme as specified
  storageKey = 'ceerion-mail-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme(storageKey, defaultTheme))
  const [resolvedTheme, setResolvedTheme] = useState<'dark' | 'light'>(() => getResolvedTheme(theme))

  useEffect(() => {
    const root = window.document.documentElement
    const newResolvedTheme = getResolvedTheme(theme)
    
    setResolvedTheme(newResolvedTheme)
    
    // Apply data-theme attribute for CSS
    root.setAttribute('data-theme', newResolvedTheme)
    
    // Also apply class for compatibility
    root.classList.remove('light', 'dark')
    root.classList.add(newResolvedTheme)
  }, [theme])

  useEffect(() => {
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    const handleChange = () => {
      if (theme === 'system') {
        const newResolvedTheme = getResolvedTheme(theme)
        setResolvedTheme(newResolvedTheme)
        
        const root = window.document.documentElement
        root.setAttribute('data-theme', newResolvedTheme)
        root.classList.remove('light', 'dark')
        root.classList.add(newResolvedTheme)
      }
    }

    mediaQuery.addListener(handleChange)
    return () => mediaQuery.removeListener(handleChange)
  }, [theme])

  const value = {
    theme,
    resolvedTheme,
    setTheme: (newTheme: Theme) => {
      try {
        localStorage.setItem(storageKey, newTheme)
      } catch {
        // Handle localStorage errors gracefully
      }
      setTheme(newTheme)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider')

  return context
}

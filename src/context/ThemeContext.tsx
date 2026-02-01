'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'

// ===========================================
// TYPES
// ===========================================

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  isDark: boolean
}

// ===========================================
// CONTEXT
// ===========================================

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

// ===========================================
// PROVIDER
// ===========================================

interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: Theme
  storageKey?: string
  attribute?: string
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'trueprofit-theme',
  attribute = 'data-theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')
  const [mounted, setMounted] = useState(false)

  // Get system theme preference
  const getSystemTheme = useCallback((): ResolvedTheme => {
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }, [])

  // Resolve theme (system -> actual theme)
  const resolveTheme = useCallback(
    (theme: Theme): ResolvedTheme => {
      if (theme === 'system') {
        return getSystemTheme()
      }
      return theme
    },
    [getSystemTheme]
  )

  // Apply theme to DOM
  const applyTheme = useCallback(
    (resolved: ResolvedTheme) => {
      if (typeof window === 'undefined') return

      const root = document.documentElement

      // Remove previous theme classes
      root.classList.remove('light', 'dark')

      // Add new theme class
      root.classList.add(resolved)

      // Set data attribute for CSS selectors
      root.setAttribute(attribute, resolved)

      // Update color-scheme for native elements
      root.style.colorScheme = resolved
    },
    [attribute]
  )

  // Set theme and persist
  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme)

      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, newTheme)
      }

      // Resolve and apply
      const resolved = resolveTheme(newTheme)
      setResolvedTheme(resolved)
      applyTheme(resolved)
    },
    [storageKey, resolveTheme, applyTheme]
  )

  // Toggle between light and dark
  const toggleTheme = useCallback(() => {
    const newTheme = resolvedTheme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
  }, [resolvedTheme, setTheme])

  // Initialize theme from localStorage or system preference
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Check localStorage first
    const stored = localStorage.getItem(storageKey) as Theme | null
    const initialTheme = stored || defaultTheme

    setThemeState(initialTheme)
    const resolved = resolveTheme(initialTheme)
    setResolvedTheme(resolved)
    applyTheme(resolved)

    setMounted(true)
  }, [storageKey, defaultTheme, resolveTheme, applyTheme])

  // Listen for system theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handleChange = () => {
      if (theme === 'system') {
        const resolved = getSystemTheme()
        setResolvedTheme(resolved)
        applyTheme(resolved)
      }
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme, getSystemTheme, applyTheme])

  // Prevent flash of unstyled content
  if (!mounted) {
    return (
      <ThemeContext.Provider
        value={{
          theme: defaultTheme,
          resolvedTheme: 'light',
          setTheme: () => {},
          toggleTheme: () => {},
          isDark: false,
        }}
      >
        {children}
      </ThemeContext.Provider>
    )
  }

  const value: ThemeContextValue = {
    theme,
    resolvedTheme,
    setTheme,
    toggleTheme,
    isDark: resolvedTheme === 'dark',
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// ===========================================
// HOOK
// ===========================================

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

// ===========================================
// THEME TOGGLE COMPONENT
// ===========================================

import { Moon, Sun, Monitor } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function ThemeToggle({
  showLabel = false,
  size = 'md',
  className,
}: ThemeToggleProps) {
  const { theme, setTheme, isDark } = useTheme()

  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
    lg: 'p-2.5',
  }

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }

  const getIcon = () => {
    if (theme === 'system') {
      return <Monitor className={iconSizes[size]} aria-hidden="true" />
    }
    if (isDark) {
      return <Moon className={iconSizes[size]} aria-hidden="true" />
    }
    return <Sun className={iconSizes[size]} aria-hidden="true" />
  }

  const getLabel = () => {
    if (theme === 'system') return 'System'
    if (isDark) return 'Morkt lage'
    return 'Ljust lage'
  }

  const cycleTheme = () => {
    const themes: Theme[] = ['light', 'dark', 'system']
    const currentIndex = themes.indexOf(theme)
    const nextIndex = (currentIndex + 1) % themes.length
    setTheme(themes[nextIndex])
  }

  return (
    <button
      onClick={cycleTheme}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg transition-colors',
        'bg-slate-100 hover:bg-slate-200 text-slate-700',
        'dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200',
        'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2',
        'dark:focus:ring-offset-slate-900',
        sizeClasses[size],
        className
      )}
      aria-label={`Byt tema (nuvarande: ${getLabel()})`}
      title={`Byt tema (nuvarande: ${getLabel()})`}
    >
      {getIcon()}
      {showLabel && (
        <span className="text-sm font-medium">{getLabel()}</span>
      )}
    </button>
  )
}

// Simple toggle between light/dark only
export function ThemeSwitch({ className }: { className?: string }) {
  const { toggleTheme, isDark } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2',
        isDark ? 'bg-violet-600' : 'bg-slate-200',
        className
      )}
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Byt till ljust lage' : 'Byt till morkt lage'}
    >
      <span
        className={cn(
          'inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow transition-transform',
          isDark ? 'translate-x-5' : 'translate-x-0.5'
        )}
      >
        {isDark ? (
          <Moon className="h-3 w-3 text-violet-600" aria-hidden="true" />
        ) : (
          <Sun className="h-3 w-3 text-amber-500" aria-hidden="true" />
        )}
      </span>
    </button>
  )
}

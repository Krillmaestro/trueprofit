'use client'

import { ReactNode } from 'react'
import { ThemeProvider, StoreProvider } from '@/context'
import { ErrorBoundary } from '@/components/feedback'

interface ProvidersProps {
  children: ReactNode
}

/**
 * Global Providers Component
 * Wraps the application with all necessary context providers
 *
 * Order matters:
 * 1. ErrorBoundary - Catches errors from all children
 * 2. ThemeProvider - Manages light/dark mode
 * 3. StoreProvider - Manages store and user settings
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" storageKey="trueprofit-theme">
        <StoreProvider>
          {children}
        </StoreProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

'use client'

import { Component, ReactNode, ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  className?: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 *
 * Usage:
 * <ErrorBoundary>
 *   <ComponentThatMightFail />
 * </ErrorBoundary>
 *
 * With custom fallback:
 * <ErrorBoundary fallback={<CustomErrorUI />}>
 *   <ComponentThatMightFail />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })

    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error)
      console.error('Component stack:', errorInfo.componentStack)
    }

    // Call optional onError callback
    this.props.onError?.(error, errorInfo)
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  handleGoHome = (): void => {
    window.location.href = '/dashboard'
  }

  render(): ReactNode {
    const { hasError, error } = this.state
    const { children, fallback, className } = this.props

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback
      }

      // Default error UI
      return (
        <div
          className={cn(
            'min-h-[400px] flex items-center justify-center p-6',
            className
          )}
          role="alert"
          aria-live="assertive"
        >
          <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-lg p-8 text-center">
            {/* Error Icon */}
            <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-rose-600" aria-hidden="true" />
            </div>

            {/* Error Message */}
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              Något gick fel
            </h2>
            <p className="text-slate-600 mb-6">
              Ett oväntat fel inträffade. Försök att ladda om sidan eller gå tillbaka till startsidan.
            </p>

            {/* Error Details (Development only) */}
            {process.env.NODE_ENV === 'development' && error && (
              <div className="mb-6 p-4 bg-slate-50 rounded-lg text-left">
                <p className="text-xs font-mono text-rose-600 break-all">
                  {error.message}
                </p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
                aria-label="Försök igen"
              >
                <RefreshCw className="w-4 h-4" aria-hidden="true" />
                Försök igen
              </button>
              <button
                onClick={this.handleGoHome}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
                aria-label="Gå till startsidan"
              >
                <Home className="w-4 h-4" aria-hidden="true" />
                Startsida
              </button>
            </div>
          </div>
        </div>
      )
    }

    return children
  }
}

/**
 * Hook-friendly wrapper for using ErrorBoundary in functional components
 * This wraps the component and provides a clean API
 */
interface WithErrorBoundaryOptions {
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options: WithErrorBoundaryOptions = {}
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary fallback={options.fallback} onError={options.onError}>
      <Component {...props} />
    </ErrorBoundary>
  )

  WrappedComponent.displayName = `WithErrorBoundary(${Component.displayName || Component.name || 'Component'})`

  return WrappedComponent
}

/**
 * Simple error fallback component for quick use
 */
interface ErrorFallbackProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function ErrorFallback({
  title = 'Något gick fel',
  message = 'Ett fel uppstod när komponenten skulle renderas.',
  onRetry,
}: ErrorFallbackProps) {
  return (
    <div className="p-6 bg-rose-50 border border-rose-200 rounded-lg text-center" role="alert">
      <AlertTriangle className="w-8 h-8 text-rose-600 mx-auto mb-3" aria-hidden="true" />
      <h3 className="text-lg font-semibold text-rose-800 mb-1">{title}</h3>
      <p className="text-rose-600 text-sm mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-rose-600 text-white text-sm rounded-md hover:bg-rose-700 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
          aria-label="Försök igen"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
          Försök igen
        </button>
      )}
    </div>
  )
}

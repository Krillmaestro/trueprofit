'use client'

/**
 * Error State Components
 * Used when something goes wrong
 */

import { ReactNode } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  WifiOff,
  ServerCrash,
  ShieldAlert,
  Clock,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

// ===========================================
// BASE ERROR STATE
// ===========================================

interface ErrorStateProps {
  icon?: ReactNode
  title?: string
  message: string
  action?: {
    label: string
    onClick?: () => void
    href?: string
  }
  secondaryAction?: {
    label: string
    onClick?: () => void
    href?: string
  }
  retry?: boolean
  onRetry?: () => void
  retrying?: boolean
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'destructive' | 'warning'
  className?: string
}

export function ErrorState({
  icon,
  title = 'Något gick fel',
  message,
  action,
  secondaryAction,
  retry,
  onRetry,
  retrying,
  size = 'md',
  variant = 'destructive',
  className,
}: ErrorStateProps) {
  const sizes = {
    sm: {
      padding: 'p-4',
      iconSize: 'w-8 h-8',
      iconWrapper: 'w-10 h-10',
      titleSize: 'text-sm',
      descSize: 'text-xs',
    },
    md: {
      padding: 'p-6',
      iconSize: 'w-10 h-10',
      iconWrapper: 'w-14 h-14',
      titleSize: 'text-base',
      descSize: 'text-sm',
    },
    lg: {
      padding: 'p-8',
      iconSize: 'w-12 h-12',
      iconWrapper: 'w-16 h-16',
      titleSize: 'text-lg',
      descSize: 'text-base',
    },
  }

  const variants = {
    default: {
      bg: 'bg-slate-50',
      border: 'border-slate-200',
      iconBg: 'bg-slate-100',
      iconColor: 'text-slate-500',
      titleColor: 'text-slate-900',
      descColor: 'text-slate-600',
    },
    destructive: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      iconBg: 'bg-red-100',
      iconColor: 'text-red-600',
      titleColor: 'text-red-900',
      descColor: 'text-red-700',
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      titleColor: 'text-amber-900',
      descColor: 'text-amber-700',
    },
  }

  const sizeConfig = sizes[size]
  const variantConfig = variants[variant]

  const defaultIcon = variant === 'warning' ? (
    <AlertTriangle className="w-full h-full" />
  ) : (
    <AlertCircle className="w-full h-full" />
  )

  return (
    <div
      className={cn(
        'rounded-lg border text-center',
        variantConfig.bg,
        variantConfig.border,
        sizeConfig.padding,
        className
      )}
    >
      <div
        className={cn(
          'inline-flex items-center justify-center rounded-full mb-4',
          variantConfig.iconBg,
          sizeConfig.iconWrapper
        )}
      >
        <div className={cn(variantConfig.iconColor, sizeConfig.iconSize)}>
          {icon || defaultIcon}
        </div>
      </div>

      <h3
        className={cn(
          'font-semibold',
          variantConfig.titleColor,
          sizeConfig.titleSize
        )}
      >
        {title}
      </h3>

      <p
        className={cn(
          'mt-2 max-w-md mx-auto',
          variantConfig.descColor,
          sizeConfig.descSize
        )}
      >
        {message}
      </p>

      {(retry || action || secondaryAction) && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          {retry && onRetry && (
            <Button
              onClick={onRetry}
              disabled={retrying}
              variant={variant === 'destructive' ? 'destructive' : 'default'}
            >
              {retrying ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Försöker igen...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Försök igen
                </>
              )}
            </Button>
          )}
          {action && (
            action.href ? (
              <Link href={action.href}>
                <Button variant="outline">{action.label}</Button>
              </Link>
            ) : (
              <Button variant="outline" onClick={action.onClick}>
                {action.label}
              </Button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <Link href={secondaryAction.href}>
                <Button variant="ghost">{secondaryAction.label}</Button>
              </Link>
            ) : (
              <Button variant="ghost" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ===========================================
// PRESET ERROR STATES
// ===========================================

interface ConnectionErrorProps {
  onRetry?: () => void
  retrying?: boolean
}

export function ConnectionError({ onRetry, retrying }: ConnectionErrorProps) {
  return (
    <ErrorState
      icon={<WifiOff className="w-full h-full" />}
      title="Ingen anslutning"
      message="Det gick inte att ansluta till servern. Kontrollera din internetanslutning och försök igen."
      retry={!!onRetry}
      onRetry={onRetry}
      retrying={retrying}
      size="lg"
    />
  )
}

interface ServerErrorProps {
  onRetry?: () => void
  retrying?: boolean
}

export function ServerError({ onRetry, retrying }: ServerErrorProps) {
  return (
    <ErrorState
      icon={<ServerCrash className="w-full h-full" />}
      title="Serverfel"
      message="Något gick fel på vår sida. Vi jobbar på att lösa problemet. Försök igen om en stund."
      retry={!!onRetry}
      onRetry={onRetry}
      retrying={retrying}
      size="lg"
    />
  )
}

interface AuthErrorProps {
  onLogin?: () => void
}

export function AuthError({ onLogin }: AuthErrorProps) {
  return (
    <ErrorState
      icon={<ShieldAlert className="w-full h-full" />}
      title="Inte inloggad"
      message="Du måste vara inloggad för att se denna sida."
      action={{
        label: 'Logga in',
        href: '/login',
      }}
      size="lg"
    />
  )
}

interface RateLimitErrorProps {
  retryAfter?: number
}

export function RateLimitError({ retryAfter }: RateLimitErrorProps) {
  return (
    <ErrorState
      icon={<Clock className="w-full h-full" />}
      title="För många förfrågningar"
      message={
        retryAfter
          ? `Vänta ${retryAfter} sekunder innan du försöker igen.`
          : 'Du har gjort för många förfrågningar. Vänta en stund innan du försöker igen.'
      }
      variant="warning"
      size="lg"
    />
  )
}

interface NotFoundErrorProps {
  resource?: string
}

export function NotFoundError({ resource = 'Sidan' }: NotFoundErrorProps) {
  return (
    <ErrorState
      icon={<XCircle className="w-full h-full" />}
      title="Hittades inte"
      message={`${resource} du letar efter kunde inte hittas.`}
      action={{
        label: 'Gå till dashboard',
        href: '/dashboard',
      }}
      variant="default"
      size="lg"
    />
  )
}

// ===========================================
// INLINE ERROR ALERT
// ===========================================

interface ErrorAlertProps {
  title?: string
  message: string
  onRetry?: () => void
  onDismiss?: () => void
  className?: string
}

export function ErrorAlert({
  title,
  message,
  onRetry,
  onDismiss,
  className,
}: ErrorAlertProps) {
  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="h-4 w-4" />
      {title && <AlertTitle>{title}</AlertTitle>}
      <AlertDescription className="flex items-center justify-between">
        <span>{message}</span>
        <div className="flex gap-2 ml-4">
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="h-7 text-xs"
            >
              Försök igen
            </Button>
          )}
          {onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              className="h-7 text-xs"
            >
              Stäng
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}

// ===========================================
// WARNING ALERT
// ===========================================

interface WarningAlertProps {
  title?: string
  message: string
  action?: {
    label: string
    onClick?: () => void
    href?: string
  }
  className?: string
}

export function WarningAlert({
  title,
  message,
  action,
  className,
}: WarningAlertProps) {
  return (
    <Alert className={cn('border-amber-200 bg-amber-50', className)}>
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      {title && <AlertTitle className="text-amber-900">{title}</AlertTitle>}
      <AlertDescription className="flex items-center justify-between text-amber-800">
        <span>{message}</span>
        {action && (
          <div className="ml-4">
            {action.href ? (
              <Link href={action.href}>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs border-amber-300 text-amber-900 hover:bg-amber-100"
                >
                  {action.label}
                </Button>
              </Link>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={action.onClick}
                className="h-7 text-xs border-amber-300 text-amber-900 hover:bg-amber-100"
              >
                {action.label}
              </Button>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}

// ===========================================
// DATA QUALITY WARNING
// ===========================================

interface DataQualityWarningProps {
  cogsMatchRate: number
  missingCount: number
  onFixClick?: () => void
}

export function DataQualityWarning({
  cogsMatchRate,
  missingCount,
  onFixClick,
}: DataQualityWarningProps) {
  if (cogsMatchRate >= 100) return null

  const severity = cogsMatchRate < 50 ? 'error' : cogsMatchRate < 80 ? 'warning' : 'info'

  const severityStyles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
  }

  const severityIcons = {
    error: <AlertCircle className="h-4 w-4 text-red-600" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    info: <AlertCircle className="h-4 w-4 text-blue-600" />,
  }

  return (
    <Alert className={severityStyles[severity]}>
      {severityIcons[severity]}
      <AlertTitle>Ofullständig COGS-data</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>
          {missingCount} produkter saknar COGS-data ({Math.round(cogsMatchRate)}% matchat).
          Vinstberäkningarna kan vara felaktiga.
        </span>
        {onFixClick && (
          <Button
            variant="outline"
            size="sm"
            onClick={onFixClick}
            className="h-7 text-xs ml-4"
          >
            Lägg till COGS
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}

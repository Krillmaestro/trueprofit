'use client'

/**
 * Empty State Components
 * Used when there's no data to display
 */

import { ReactNode } from 'react'
import Link from 'next/link'
import {
  Package,
  ShoppingCart,
  TrendingUp,
  Calendar,
  Store,
  AlertCircle,
  FileText,
  BarChart3,
  RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

// ===========================================
// BASE EMPTY STATE
// ===========================================

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  secondaryAction?: {
    label: string
    href?: string
    onClick?: () => void
  }
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  size = 'md',
  className,
}: EmptyStateProps) {
  const sizes = {
    sm: {
      padding: 'p-6',
      iconSize: 'w-10 h-10',
      iconWrapper: 'w-12 h-12',
      titleSize: 'text-base',
      descSize: 'text-sm',
    },
    md: {
      padding: 'p-8',
      iconSize: 'w-12 h-12',
      iconWrapper: 'w-16 h-16',
      titleSize: 'text-lg',
      descSize: 'text-sm',
    },
    lg: {
      padding: 'p-12',
      iconSize: 'w-14 h-14',
      iconWrapper: 'w-20 h-20',
      titleSize: 'text-xl',
      descSize: 'text-base',
    },
  }

  const config = sizes[size]

  return (
    <div className={cn('text-center', config.padding, className)}>
      {icon && (
        <div
          className={cn(
            'inline-flex items-center justify-center rounded-xl bg-slate-100 mb-4',
            config.iconWrapper
          )}
        >
          <div className={cn('text-slate-400', config.iconSize)}>
            {icon}
          </div>
        </div>
      )}

      <h3
        className={cn(
          'font-semibold text-slate-900',
          config.titleSize
        )}
      >
        {title}
      </h3>

      {description && (
        <p
          className={cn(
            'mt-2 text-slate-500 max-w-md mx-auto',
            config.descSize
          )}
        >
          {description}
        </p>
      )}

      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
          {action && (
            action.href ? (
              <Link href={action.href}>
                <Button>{action.label}</Button>
              </Link>
            ) : (
              <Button onClick={action.onClick}>{action.label}</Button>
            )
          )}
          {secondaryAction && (
            secondaryAction.href ? (
              <Link href={secondaryAction.href}>
                <Button variant="outline">{secondaryAction.label}</Button>
              </Link>
            ) : (
              <Button variant="outline" onClick={secondaryAction.onClick}>
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
// PRESET EMPTY STATES
// ===========================================

interface NoStoreStateProps {
  onConnect?: () => void
}

export function NoStoreState({ onConnect }: NoStoreStateProps) {
  return (
    <EmptyState
      icon={<Store className="w-full h-full" />}
      title="Koppla din Shopify-butik"
      description="För att se vinstdata behöver du först koppla din Shopify-butik till TrueProfit."
      action={{
        label: 'Koppla butik',
        href: '/settings/stores',
      }}
      size="lg"
    />
  )
}

interface NoDataStateProps {
  onSync?: () => void
  syncing?: boolean
  dateRange?: string
}

export function NoDataState({ onSync, syncing, dateRange }: NoDataStateProps) {
  return (
    <EmptyState
      icon={<Calendar className="w-full h-full" />}
      title="Ingen data för vald period"
      description={
        dateRange
          ? `Det finns inga ordrar för perioden ${dateRange}. Försök med ett annat datumintervall eller synka för senaste data.`
          : 'Det finns inga ordrar för den valda tidsperioden. Försök med ett annat datumintervall eller synka för senaste data.'
      }
      action={
        onSync
          ? {
              label: syncing ? 'Synkar...' : 'Synka data',
              onClick: syncing ? undefined : onSync,
            }
          : undefined
      }
      secondaryAction={{
        label: 'Ändra datumintervall',
        onClick: () => {}, // Will be handled by parent
      }}
      size="lg"
    />
  )
}

export function NoProductsState() {
  return (
    <EmptyState
      icon={<Package className="w-full h-full" />}
      title="Inga produkter hittades"
      description="Synka din butik för att importera produkter och börja spåra COGS."
      action={{
        label: 'Synka produkter',
        href: '/settings/stores',
      }}
      size="md"
    />
  )
}

export function NoCOGSState() {
  return (
    <EmptyState
      icon={<TrendingUp className="w-full h-full" />}
      title="Lägg till COGS-data"
      description="För att beräkna vinst per produkt behöver du lägga till inköpspriser (COGS) för dina produkter."
      action={{
        label: 'Lägg till COGS',
        href: '/cogs',
      }}
      size="md"
    />
  )
}

export function NoOrdersState() {
  return (
    <EmptyState
      icon={<ShoppingCart className="w-full h-full" />}
      title="Inga ordrar ännu"
      description="När du får din första order kommer den visas här."
      size="md"
    />
  )
}

export function NoExpensesState() {
  return (
    <EmptyState
      icon={<FileText className="w-full h-full" />}
      title="Inga utgifter registrerade"
      description="Lägg till dina fasta kostnader och utgifter för att få en komplett bild av din lönsamhet."
      action={{
        label: 'Lägg till utgift',
        href: '/expenses',
      }}
      size="md"
    />
  )
}

export function NoReportsState() {
  return (
    <EmptyState
      icon={<BarChart3 className="w-full h-full" />}
      title="Ingen rapportdata"
      description="Det finns inte tillräckligt med data för att generera rapporter. Fortsätt sälja så dyker statistiken upp här."
      size="md"
    />
  )
}

// ===========================================
// TABLE EMPTY STATE
// ===========================================

interface TableEmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick?: () => void
    href?: string
  }
}

export function TableEmptyState({
  icon,
  title,
  description,
  action,
}: TableEmptyStateProps) {
  return (
    <div className="text-center py-12 px-4">
      {icon && (
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-slate-100 mb-4">
          <div className="w-6 h-6 text-slate-400">{icon}</div>
        </div>
      )}
      <h3 className="text-sm font-medium text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link href={action.href}>
              <Button variant="outline" size="sm">
                {action.label}
              </Button>
            </Link>
          ) : (
            <Button variant="outline" size="sm" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ===========================================
// CARD EMPTY STATE
// ===========================================

interface CardEmptyStateProps {
  icon?: ReactNode
  message: string
  action?: {
    label: string
    onClick?: () => void
  }
}

export function CardEmptyState({ icon, message, action }: CardEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      {icon && (
        <div className="w-8 h-8 text-slate-300 mb-2">{icon}</div>
      )}
      <p className="text-sm text-slate-500">{message}</p>
      {action && (
        <Button
          variant="ghost"
          size="sm"
          onClick={action.onClick}
          className="mt-2"
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}

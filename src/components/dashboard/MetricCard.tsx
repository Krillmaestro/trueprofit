'use client'

/**
 * MetricCard Component
 * Clean, minimal design inspired by Linear/Stripe
 * Optimized with React.memo for performance
 */

import { ReactNode, memo } from 'react'
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Skeleton } from '@/components/feedback'

// ===========================================
// TYPES
// ===========================================

type TrendDirection = 'up' | 'down' | 'neutral'
type MetricVariant = 'default' | 'success' | 'warning' | 'danger'

interface MetricCardProps {
  /** Label displayed above the value */
  label: string
  /** Main value to display */
  value: string | number
  /** Optional formatted value (if different from value) */
  formattedValue?: string
  /** Percentage change from previous period */
  change?: number
  /** Label for the change (e.g., "vs förra månaden") */
  changeLabel?: string
  /** Explicit trend direction (auto-detected from change if not provided) */
  trend?: TrendDirection
  /** Visual variant for semantic meaning */
  variant?: MetricVariant
  /** Optional icon to display */
  icon?: ReactNode
  /** Optional tooltip with additional info */
  tooltip?: string
  /** Loading state */
  loading?: boolean
  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
  /** Additional className */
  className?: string
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function formatValue(value: string | number, formattedValue?: string): string {
  if (formattedValue) return formattedValue
  if (typeof value === 'string') return value
  return value.toLocaleString('sv-SE')
}

function getTrendDirection(change?: number): TrendDirection {
  if (change === undefined || change === 0) return 'neutral'
  return change > 0 ? 'up' : 'down'
}

function getTrendIcon(direction: TrendDirection) {
  switch (direction) {
    case 'up':
      return TrendingUp
    case 'down':
      return TrendingDown
    default:
      return Minus
  }
}

function getTrendColor(direction: TrendDirection, variant: MetricVariant): string {
  // For profit/success metrics: up is good (green), down is bad (red)
  // For cost/danger metrics: up is bad (red), down is good (green)
  if (variant === 'danger') {
    switch (direction) {
      case 'up':
        return 'text-red-600 dark:text-red-400'
      case 'down':
        return 'text-emerald-600 dark:text-emerald-400'
      default:
        return 'text-slate-500 dark:text-slate-400'
    }
  }

  switch (direction) {
    case 'up':
      return 'text-emerald-600 dark:text-emerald-400'
    case 'down':
      return 'text-red-600 dark:text-red-400'
    default:
      return 'text-slate-500 dark:text-slate-400'
  }
}

// ===========================================
// MAIN COMPONENT
// ===========================================

export const MetricCard = memo(function MetricCard({
  label,
  value,
  formattedValue,
  change,
  changeLabel = 'vs förra perioden',
  trend,
  variant = 'default',
  icon,
  tooltip,
  loading = false,
  size = 'md',
  className,
}: MetricCardProps) {
  // Determine trend direction
  const trendDirection = trend ?? getTrendDirection(change)
  const TrendIcon = getTrendIcon(trendDirection)
  const trendColor = getTrendColor(trendDirection, variant)

  // Size configurations
  const sizeConfig = {
    sm: {
      padding: 'p-4',
      labelSize: 'text-xs',
      valueSize: 'text-xl',
      changeSize: 'text-xs',
      iconSize: 'w-3.5 h-3.5',
    },
    md: {
      padding: 'p-5',
      labelSize: 'text-xs',
      valueSize: 'text-2xl',
      changeSize: 'text-sm',
      iconSize: 'w-4 h-4',
    },
    lg: {
      padding: 'p-6',
      labelSize: 'text-sm',
      valueSize: 'text-3xl',
      changeSize: 'text-sm',
      iconSize: 'w-5 h-5',
    },
  }

  const config = sizeConfig[size]

  // Variant border colors
  const variantStyles = {
    default: '',
    success: 'border-l-2 border-l-emerald-500',
    warning: 'border-l-2 border-l-amber-500',
    danger: 'border-l-2 border-l-red-500',
  }

  if (loading) {
    return (
      <div
        className={cn(
          'bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700',
          config.padding,
          variantStyles[variant],
          className
        )}
      >
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-28" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700',
        'transition-shadow duration-200 hover:shadow-sm dark:hover:shadow-slate-800/50',
        config.padding,
        variantStyles[variant],
        className
      )}
    >
      {/* Header: Label + Icon/Tooltip */}
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            'font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide',
            config.labelSize
          )}
        >
          {label}
        </span>

        <div className="flex items-center gap-1">
          {icon && (
            <span className="text-slate-400 dark:text-slate-500">{icon}</span>
          )}
          {tooltip && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
                    aria-label={`Mer information om ${label}`}
                  >
                    <Info className="w-4 h-4" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-sm">{tooltip}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Value */}
      <div
        className={cn(
          'font-semibold text-slate-900 dark:text-slate-100 tracking-tight',
          config.valueSize
        )}
      >
        {formatValue(value, formattedValue)}
      </div>

      {/* Change indicator */}
      {change !== undefined && (
        <div className="flex items-center gap-1.5 mt-2">
          <TrendIcon className={cn(config.iconSize, trendColor)} aria-hidden="true" />
          <span className={cn('font-medium', config.changeSize, trendColor)}>
            {change > 0 && '+'}
            {change.toFixed(1)}%
          </span>
          <span className={cn('text-slate-500 dark:text-slate-400', config.changeSize)}>
            {changeLabel}
          </span>
        </div>
      )}
    </div>
  )
})

// ===========================================
// SPECIALIZED VARIANTS
// ===========================================

interface ProfitCardProps extends Omit<MetricCardProps, 'variant'> {
  isProfit?: boolean
}

export function ProfitCard({ isProfit = true, ...props }: ProfitCardProps) {
  const value = typeof props.value === 'number' ? props.value : parseFloat(String(props.value).replace(/[^0-9.-]/g, ''))
  const variant = isProfit && value > 0 ? 'success' : value < 0 ? 'danger' : 'default'

  return <MetricCard {...props} variant={variant} />
}

interface CostCardProps extends Omit<MetricCardProps, 'variant'> {}

export function CostCard(props: CostCardProps) {
  return <MetricCard {...props} variant="danger" />
}

interface RevenueCardProps extends Omit<MetricCardProps, 'variant'> {}

export function RevenueCard(props: RevenueCardProps) {
  return <MetricCard {...props} variant="default" />
}

// ===========================================
// HERO METRIC CARD (Larger, more prominent)
// ===========================================

interface HeroMetricCardProps {
  label: string
  value: string | number
  formattedValue?: string
  change?: number
  changeLabel?: string
  description?: string
  icon?: ReactNode
  variant?: MetricVariant
  loading?: boolean
  className?: string
}

export const HeroMetricCard = memo(function HeroMetricCard({
  label,
  value,
  formattedValue,
  change,
  changeLabel = 'vs förra perioden',
  description,
  icon,
  variant = 'default',
  loading = false,
  className,
}: HeroMetricCardProps) {
  const trendDirection = getTrendDirection(change)
  const TrendIcon = getTrendIcon(trendDirection)
  const trendColor = getTrendColor(trendDirection, variant)

  if (loading) {
    return (
      <div
        className={cn(
          'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-6',
          className
        )}
      >
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    )
  }

  // Variant background styles
  const variantBg = {
    default: 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700',
    success: 'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/30 dark:to-slate-900 border-emerald-200 dark:border-emerald-800',
    warning: 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/30 dark:to-slate-900 border-amber-200 dark:border-amber-800',
    danger: 'bg-gradient-to-br from-red-50 to-white dark:from-red-900/30 dark:to-slate-900 border-red-200 dark:border-red-800',
  }

  return (
    <div
      className={cn(
        'rounded-xl border p-6',
        'transition-shadow duration-200 hover:shadow-md dark:hover:shadow-slate-800/50',
        variantBg[variant],
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</span>
        {icon && <span className="text-slate-400 dark:text-slate-500">{icon}</span>}
      </div>

      {/* Large Value */}
      <div className="text-4xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-2">
        {formatValue(value, formattedValue)}
      </div>

      {/* Change + Description */}
      <div className="flex items-center gap-3">
        {change !== undefined && (
          <div className="flex items-center gap-1">
            <TrendIcon className={cn('w-4 h-4', trendColor)} aria-hidden="true" />
            <span className={cn('text-sm font-medium', trendColor)}>
              {change > 0 && '+'}
              {change.toFixed(1)}%
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">{changeLabel}</span>
          </div>
        )}
        {description && (
          <span className="text-sm text-slate-500 dark:text-slate-400">{description}</span>
        )}
      </div>
    </div>
  )
})

// ===========================================
// METRIC CARD GRID
// ===========================================

interface MetricCardGridProps {
  children: ReactNode
  columns?: 2 | 3 | 4 | 5
  className?: string
}

export function MetricCardGrid({
  children,
  columns = 4,
  className,
}: MetricCardGridProps) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  }

  return (
    <div className={cn('grid gap-4', gridCols[columns], className)}>
      {children}
    </div>
  )
}

// ===========================================
// EXPORTS
// ===========================================

export type { MetricCardProps, HeroMetricCardProps, MetricCardGridProps }

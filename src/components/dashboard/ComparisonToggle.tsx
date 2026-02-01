'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ArrowLeftRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { DateRange } from './DateRangePicker'

interface ComparisonToggleProps {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  className?: string
}

export function ComparisonToggle({ enabled, onToggle, className }: ComparisonToggleProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={enabled ? 'default' : 'outline'}
            size="sm"
            onClick={() => onToggle(!enabled)}
            className={cn(
              'gap-2 transition-all',
              enabled
                ? 'bg-violet-600 hover:bg-violet-700'
                : 'border-slate-300 text-slate-700 hover:bg-slate-100',
              className
            )}
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span className="hidden sm:inline">Jämför</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Jämför med föregående period</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// Calculate the previous period based on current range
export function getPreviousPeriod(current: DateRange): DateRange {
  const duration = current.endDate.getTime() - current.startDate.getTime()
  const daysInPeriod = Math.ceil(duration / (1000 * 60 * 60 * 24))

  const previousEndDate = new Date(current.startDate)
  previousEndDate.setDate(previousEndDate.getDate() - 1)
  previousEndDate.setHours(23, 59, 59, 999)

  const previousStartDate = new Date(previousEndDate)
  previousStartDate.setDate(previousStartDate.getDate() - daysInPeriod + 1)
  previousStartDate.setHours(0, 0, 0, 0)

  return {
    startDate: previousStartDate,
    endDate: previousEndDate,
    label: `Föregående ${daysInPeriod} dagar`,
  }
}

// Comparison badge component
interface ComparisonBadgeProps {
  current: number
  previous: number
  format?: 'percent' | 'currency' | 'number'
  inverted?: boolean // For costs, lower is better
  className?: string
}

export function ComparisonBadge({
  current,
  previous,
  format = 'percent',
  inverted = false,
  className,
}: ComparisonBadgeProps) {
  if (previous === 0) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-slate-400', className)}>
        <Minus className="w-3 h-3" />
        <span>—</span>
      </span>
    )
  }

  const change = ((current - previous) / previous) * 100
  const isPositive = inverted ? change < 0 : change > 0
  const isNeutral = Math.abs(change) < 1

  const formatChange = () => {
    if (format === 'percent') {
      return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`
    }
    if (format === 'currency') {
      const diff = current - previous
      return `${diff >= 0 ? '+' : ''}${diff.toLocaleString('sv-SE')} kr`
    }
    const diff = current - previous
    return `${diff >= 0 ? '+' : ''}${diff.toLocaleString('sv-SE')}`
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded',
        isNeutral
          ? 'text-slate-500 bg-slate-100'
          : isPositive
          ? 'text-emerald-700 bg-emerald-50'
          : 'text-rose-700 bg-rose-50',
        className
      )}
    >
      {isNeutral ? (
        <Minus className="w-3 h-3" />
      ) : isPositive ? (
        <TrendingUp className="w-3 h-3" />
      ) : (
        <TrendingDown className="w-3 h-3" />
      )}
      <span>{formatChange()}</span>
    </span>
  )
}

// Hook for comparison data
interface ComparisonData {
  current: number
  previous: number
  change: number
  changePercent: number
}

export function useComparison(
  currentValue: number,
  previousValue: number
): ComparisonData {
  const change = currentValue - previousValue
  const changePercent = previousValue !== 0 ? (change / previousValue) * 100 : 0

  return {
    current: currentValue,
    previous: previousValue,
    change,
    changePercent,
  }
}

// Comparison card component
interface ComparisonCardProps {
  title: string
  current: number
  previous: number
  format?: 'currency' | 'percent' | 'number'
  suffix?: string
  icon?: React.ReactNode
  inverted?: boolean
  loading?: boolean
  className?: string
}

export function ComparisonCard({
  title,
  current,
  previous,
  format = 'currency',
  suffix = '',
  icon,
  inverted = false,
  loading = false,
  className,
}: ComparisonCardProps) {
  const formatValue = (value: number) => {
    if (format === 'currency') {
      return value.toLocaleString('sv-SE')
    }
    if (format === 'percent') {
      return value.toFixed(1)
    }
    return value.toLocaleString('sv-SE')
  }

  if (loading) {
    return (
      <div className={cn('p-4 rounded-xl bg-white border border-slate-200', className)}>
        <div className="animate-pulse">
          <div className="h-4 w-20 bg-slate-200 rounded mb-2" />
          <div className="h-7 w-32 bg-slate-200 rounded mb-2" />
          <div className="h-4 w-24 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('p-4 rounded-xl bg-white border border-slate-200', className)}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-slate-500">{title}</span>
        {icon}
      </div>
      <div className="flex items-end gap-2 mb-1">
        <span className="text-xl font-bold text-slate-800">
          {formatValue(current)}{suffix}
        </span>
        <ComparisonBadge
          current={current}
          previous={previous}
          format="percent"
          inverted={inverted}
        />
      </div>
      <div className="text-xs text-slate-400">
        Föreg: {formatValue(previous)}{suffix}
      </div>
    </div>
  )
}

// Comparison summary component
interface ComparisonSummaryProps {
  currentPeriod: DateRange
  previousPeriod: DateRange
  metrics: {
    revenue: { current: number; previous: number }
    profit: { current: number; previous: number }
    orders: { current: number; previous: number }
    margin: { current: number; previous: number }
  }
  loading?: boolean
  className?: string
}

export function ComparisonSummary({
  currentPeriod,
  previousPeriod,
  metrics,
  loading = false,
  className,
}: ComparisonSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl',
        'bg-gradient-to-br from-violet-50 via-white to-blue-50',
        'border border-violet-200/50',
        className
      )}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-violet-600" />
            <span className="text-sm font-medium text-slate-700">Periodjämförelse</span>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-violet-600 hover:text-violet-700"
          >
            {isExpanded ? 'Dölj detaljer' : 'Visa detaljer'}
          </button>
        </div>

        {/* Period labels */}
        <div className="flex items-center gap-4 mb-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-violet-500" />
            <span className="text-slate-600">{currentPeriod.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-slate-300" />
            <span className="text-slate-500">{previousPeriod.label}</span>
          </div>
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white/70 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">Omsättning</div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800">
                {loading ? '...' : metrics.revenue.current.toLocaleString('sv-SE')} kr
              </span>
              {!loading && (
                <ComparisonBadge
                  current={metrics.revenue.current}
                  previous={metrics.revenue.previous}
                />
              )}
            </div>
          </div>
          <div className="bg-white/70 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">Vinst</div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800">
                {loading ? '...' : metrics.profit.current.toLocaleString('sv-SE')} kr
              </span>
              {!loading && (
                <ComparisonBadge
                  current={metrics.profit.current}
                  previous={metrics.profit.previous}
                />
              )}
            </div>
          </div>
          <div className="bg-white/70 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">Ordrar</div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800">
                {loading ? '...' : metrics.orders.current.toLocaleString('sv-SE')}
              </span>
              {!loading && (
                <ComparisonBadge
                  current={metrics.orders.current}
                  previous={metrics.orders.previous}
                />
              )}
            </div>
          </div>
          <div className="bg-white/70 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">Marginal</div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800">
                {loading ? '...' : metrics.margin.current.toFixed(1)}%
              </span>
              {!loading && (
                <ComparisonBadge
                  current={metrics.margin.current}
                  previous={metrics.margin.previous}
                />
              )}
            </div>
          </div>
        </div>

        {/* Expanded details */}
        {isExpanded && !loading && (
          <div className="mt-4 pt-4 border-t border-slate-200/50">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Revenue details */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-2">Omsättning</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{currentPeriod.label}</span>
                    <span className="font-medium">{metrics.revenue.current.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{previousPeriod.label}</span>
                    <span className="text-slate-600">{metrics.revenue.previous.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between text-sm pt-1 border-t border-slate-100">
                    <span className="text-slate-500">Förändring</span>
                    <ComparisonBadge
                      current={metrics.revenue.current}
                      previous={metrics.revenue.previous}
                      format="currency"
                    />
                  </div>
                </div>
              </div>

              {/* Profit details */}
              <div>
                <h4 className="text-sm font-medium text-slate-700 mb-2">Vinst</h4>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{currentPeriod.label}</span>
                    <span className="font-medium">{metrics.profit.current.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">{previousPeriod.label}</span>
                    <span className="text-slate-600">{metrics.profit.previous.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between text-sm pt-1 border-t border-slate-100">
                    <span className="text-slate-500">Förändring</span>
                    <ComparisonBadge
                      current={metrics.profit.current}
                      previous={metrics.profit.previous}
                      format="currency"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

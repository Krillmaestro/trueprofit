import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: string | number
  change?: number
  changeLabel?: string
  icon?: LucideIcon
  iconColor?: string
  borderColor?: string
  loading?: boolean
}

export function MetricCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  iconColor = 'text-blue-500',
  borderColor = 'border-l-blue-500',
  loading = false,
}: MetricCardProps) {
  const isPositive = change && change > 0
  const isNegative = change && change < 0

  if (loading) {
    return (
      <div className={cn('bg-white rounded-xl shadow-sm p-6 border-l-4', borderColor)}>
        <div className="animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-24 mb-4" />
          <div className="h-8 bg-slate-200 rounded w-32" />
        </div>
      </div>
    )
  }

  return (
    <div className={cn('bg-white rounded-xl shadow-sm p-6 border-l-4', borderColor)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-slate-600 text-sm font-medium">{title}</span>
        {Icon && <Icon className={cn('h-5 w-5', iconColor)} />}
      </div>
      <div className="text-3xl font-bold text-slate-800">
        {typeof value === 'number' ? value.toLocaleString('sv-SE') : value}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-2">
          <span
            className={cn(
              'text-sm font-medium',
              isPositive && 'text-green-600',
              isNegative && 'text-red-600',
              !isPositive && !isNegative && 'text-slate-500'
            )}
          >
            {isPositive && '+'}
            {change.toFixed(1)}%
          </span>
          {changeLabel && (
            <span className="text-slate-500 text-sm">{changeLabel}</span>
          )}
        </div>
      )}
    </div>
  )
}

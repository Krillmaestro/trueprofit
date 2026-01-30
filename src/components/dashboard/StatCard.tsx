'use client'

import { cn } from '@/lib/utils'
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { GlowCard } from './GlowCard'
import { AnimatedNumber } from './AnimatedNumber'
import { Sparkline } from './Sparkline'

interface StatCardProps {
  title: string
  value: number
  previousValue?: number
  prefix?: string
  suffix?: string
  icon?: LucideIcon
  iconBgColor?: string
  iconColor?: string
  trend?: number[]
  loading?: boolean
  compact?: boolean
  decimals?: number  // Number of decimal places to show
}

export function StatCard({
  title,
  value,
  previousValue,
  prefix = '',
  suffix = '',
  icon: Icon,
  iconBgColor = 'bg-blue-50',
  iconColor = 'text-blue-600',
  trend,
  loading = false,
  compact = false,
  decimals,
}: StatCardProps) {
  const change = previousValue !== undefined ? ((value - previousValue) / previousValue) * 100 : undefined
  const isPositive = change !== undefined && change > 0
  const isNegative = change !== undefined && change < 0

  const getTrendColor = () => {
    if (isPositive) return '#22c55e'
    if (isNegative) return '#ef4444'
    return '#64748b'
  }

  const glowColor = isPositive ? 'emerald' : isNegative ? 'rose' : 'blue'

  if (loading) {
    return (
      <GlowCard className={cn('p-5', compact && 'p-4')} hover={false}>
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-3">
            <div className="h-4 bg-slate-200 rounded w-20" />
            {Icon && <div className="h-10 w-10 bg-slate-200 rounded-xl" />}
          </div>
          <div className="h-8 bg-slate-200 rounded w-28 mb-2" />
          <div className="h-4 bg-slate-200 rounded w-16" />
        </div>
      </GlowCard>
    )
  }

  return (
    <GlowCard className={cn('p-5', compact && 'p-4')} glowColor={glowColor}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-slate-500 truncate">{title}</span>
          </div>

          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold text-slate-800 tracking-tight">
              <AnimatedNumber
                value={value}
                prefix={prefix}
                suffix={suffix}
                formatOptions={decimals !== undefined ? {
                  minimumFractionDigits: decimals,
                  maximumFractionDigits: decimals,
                } : undefined}
              />
            </span>
          </div>

          {/* Change indicator */}
          {change !== undefined && (
            <div className="flex items-center gap-1.5 mt-2">
              <div
                className={cn(
                  'flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-medium',
                  isPositive && 'bg-emerald-50 text-emerald-700',
                  isNegative && 'bg-rose-50 text-rose-700',
                  !isPositive && !isNegative && 'bg-slate-100 text-slate-600'
                )}
              >
                {isPositive ? (
                  <TrendingUp className="w-3 h-3" />
                ) : isNegative ? (
                  <TrendingDown className="w-3 h-3" />
                ) : (
                  <Minus className="w-3 h-3" />
                )}
                <span>{Math.abs(change).toFixed(1)}%</span>
              </div>
              <span className="text-xs text-slate-400">vs last period</span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {Icon && (
            <div className={cn('p-2.5 rounded-xl', iconBgColor)}>
              <Icon className={cn('w-5 h-5', iconColor)} />
            </div>
          )}
          {trend && trend.length > 1 && (
            <Sparkline data={trend} color={getTrendColor()} height={28} width={60} />
          )}
        </div>
      </div>
    </GlowCard>
  )
}

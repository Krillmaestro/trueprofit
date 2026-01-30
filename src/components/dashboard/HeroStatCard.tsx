'use client'

import { cn } from '@/lib/utils'
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { AnimatedNumber } from './AnimatedNumber'

interface HeroStatCardProps {
  title: string
  value: number
  previousValue?: number
  suffix?: string
  prefix?: string
  icon: LucideIcon
  gradient: 'emerald' | 'blue' | 'violet' | 'amber' | 'rose'
  loading?: boolean
  className?: string
}

const gradientClasses = {
  emerald: 'from-emerald-500 to-emerald-600',
  blue: 'from-blue-500 to-blue-600',
  violet: 'from-violet-500 to-violet-600',
  amber: 'from-amber-500 to-amber-600',
  rose: 'from-rose-500 to-rose-600',
}

const glowClasses = {
  emerald: 'shadow-emerald-500/25',
  blue: 'shadow-blue-500/25',
  violet: 'shadow-violet-500/25',
  amber: 'shadow-amber-500/25',
  rose: 'shadow-rose-500/25',
}

export function HeroStatCard({
  title,
  value,
  previousValue,
  suffix = '',
  prefix = '',
  icon: Icon,
  gradient,
  loading = false,
  className,
}: HeroStatCardProps) {
  // Calculate change percentage
  const change = previousValue !== undefined && previousValue !== 0
    ? ((value - previousValue) / Math.abs(previousValue)) * 100
    : null

  const isPositive = change !== null && change > 0
  const isNegative = change !== null && change < 0

  const formatValue = (val: number) => {
    const absVal = Math.abs(val)
    if (absVal >= 1000000) {
      return { number: val / 1000000, suffix: 'M' + suffix }
    }
    if (absVal >= 1000) {
      return { number: val / 1000, suffix: 'k' + suffix }
    }
    return { number: val, suffix }
  }

  const formattedValue = formatValue(value)

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl p-6',
        'bg-gradient-to-br',
        gradientClasses[gradient],
        'shadow-xl',
        glowClasses[gradient],
        'transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl',
        className
      )}
    >
      {/* Background decorations */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-12 -translate-x-12" />

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Icon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white/80">{title}</h3>
            </div>
          </div>

          {/* Change badge */}
          {change !== null && (
            <div className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
              'bg-white/20 backdrop-blur-sm text-white'
            )}>
              {isPositive && <TrendingUp className="w-3 h-3" />}
              {isNegative && <TrendingDown className="w-3 h-3" />}
              {!isPositive && !isNegative && <Minus className="w-3 h-3" />}
              <span>{isPositive ? '+' : ''}{change.toFixed(1)}%</span>
            </div>
          )}
        </div>

        {/* Value */}
        <div className="flex items-baseline gap-1">
          {prefix && <span className="text-2xl font-medium text-white/80">{prefix}</span>}
          {loading ? (
            <div className="h-12 w-32 bg-white/20 rounded-lg animate-pulse" />
          ) : (
            <AnimatedNumber
              value={formattedValue.number}
              className="text-4xl md:text-5xl font-bold text-white tracking-tight"
              formatOptions={{
                maximumFractionDigits: formattedValue.suffix.includes('M') || formattedValue.suffix.includes('k') ? 1 : 0,
                minimumFractionDigits: 0,
              }}
            />
          )}
          <span className="text-xl font-medium text-white/80">{formattedValue.suffix}</span>
        </div>

        {/* Subtitle with previous value */}
        {previousValue !== undefined && (
          <p className="text-sm text-white/60 mt-2">
            vs {formatValue(previousValue).number.toLocaleString('sv-SE', { maximumFractionDigits: 1 })}{formatValue(previousValue).suffix} förra perioden
          </p>
        )}
      </div>
    </div>
  )
}

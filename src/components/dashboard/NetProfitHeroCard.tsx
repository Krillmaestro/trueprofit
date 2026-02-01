'use client'

import { useMemo, memo } from 'react'
import { cn } from '@/lib/utils'
import { GlowCard } from './GlowCard'
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Percent,
  ShoppingCart,
} from 'lucide-react'

interface NetProfitHeroCardProps {
  revenue: number
  costs: number
  profit: number
  margin: number
  orders: number
  adSpend: number
  previousProfit?: number
  loading?: boolean
  className?: string
}

export const NetProfitHeroCard = memo(function NetProfitHeroCard({
  revenue,
  costs,
  profit,
  margin,
  orders,
  adSpend,
  previousProfit,
  loading,
  className,
}: NetProfitHeroCardProps) {
  const analysis = useMemo(() => {
    const profitPerOrder = orders > 0 ? profit / orders : 0
    const costPerOrder = orders > 0 ? costs / orders : 0
    const revenuePerOrder = orders > 0 ? revenue / orders : 0

    // Change from previous period
    const change = previousProfit !== undefined
      ? ((profit - previousProfit) / Math.abs(previousProfit || 1)) * 100
      : null

    // Profit status - simple: green for profit, red for loss
    const status = profit >= 0 ? 'profit' : 'loss'

    return {
      profitPerOrder,
      costPerOrder,
      revenuePerOrder,
      change,
      status,
    }
  }, [revenue, costs, profit, orders, previousProfit])

  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value)
    if (absValue >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    }
    if (absValue >= 1000) {
      return `${(value / 1000).toFixed(1)}k`
    }
    return value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })
  }

  const getStatusConfig = () => {
    switch (analysis.status) {
      case 'profit':
        return {
          gradient: 'from-emerald-500 to-teal-600',
          bgGradient: 'from-emerald-500/10 to-teal-600/10',
          text: 'Vinst',
          color: 'text-emerald-600',
        }
      case 'loss':
      default:
        return {
          gradient: 'from-rose-500 to-red-600',
          bgGradient: 'from-rose-500/10 to-red-600/10',
          text: 'Förlust',
          color: 'text-rose-600',
        }
    }
  }

  const config = getStatusConfig()

  if (loading) {
    return (
      <GlowCard className={cn('p-6 h-full', className)} glowColor="emerald">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-32" />
          <div className="h-16 bg-slate-200 dark:bg-slate-700 rounded w-48" />
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="h-16 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-16 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-16 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
        </div>
      </GlowCard>
    )
  }

  return (
    <div className={cn('relative overflow-hidden rounded-2xl', className)}>
      {/* Background gradient */}
      <div className={cn(
        'absolute inset-0 bg-gradient-to-br',
        config.gradient
      )} />

      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      {/* Content */}
      <div className="relative p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center" aria-hidden="true">
              <TrendingUp className="w-5 h-5 text-white" aria-label="Nettovinst trend" />
            </div>
            <div>
              <h3 className="font-semibold text-white/90">Nettovinst</h3>
              <p className="text-xs text-white/60">Efter alla kostnader</p>
            </div>
          </div>

          {/* Change indicator */}
          {analysis.change !== null && (
            <div className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium',
              analysis.change >= 0 ? 'bg-white/20 text-white' : 'bg-white/20 text-white'
            )}>
              {analysis.change >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {analysis.change >= 0 ? '+' : ''}{analysis.change.toFixed(1)}%
            </div>
          )}
        </div>

        {/* Main profit value */}
        <div className="mt-4 mb-6">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-bold text-white tracking-tight">
              {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
            </span>
            <span className="text-2xl text-white/70">kr</span>
          </div>
          <div className="flex items-center gap-4 mt-2 text-white/70 text-sm">
            <span className="flex items-center gap-1">
              <Percent className="w-4 h-4" />
              {margin.toFixed(1)}% marginal
            </span>
            <span className="flex items-center gap-1">
              <ShoppingCart className="w-4 h-4" />
              {orders} ordrar
            </span>
          </div>
        </div>

        {/* Flow visualization */}
        <div className="bg-white/10 backdrop-blur rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between gap-2">
            {/* Revenue ex VAT - for correct math */}
            <div className="flex-1 text-center">
              <div className="text-xs text-white/60 mb-1">Nettoomsättning</div>
              <div className="text-lg font-bold text-white">{formatCurrency(revenue)} kr</div>
            </div>

            <ArrowRight className="w-5 h-5 text-white/40 flex-shrink-0" />

            {/* Costs */}
            <div className="flex-1 text-center">
              <div className="text-xs text-white/60 mb-1">Kostnader</div>
              <div className="text-lg font-bold text-white/90">-{formatCurrency(costs)} kr</div>
            </div>

            <ArrowRight className="w-5 h-5 text-white/40 flex-shrink-0" />

            {/* Profit */}
            <div className="flex-1 text-center">
              <div className="text-xs text-white/60 mb-1">Vinst</div>
              <div className="text-lg font-bold text-white">
                {profit >= 0 ? '+' : ''}{formatCurrency(profit)} kr
              </div>
            </div>
          </div>
        </div>

        {/* Bottom stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white/10 backdrop-blur rounded-lg p-3 text-center">
            <div className="text-xs text-white/60 mb-1">Vinst/order</div>
            <div className="text-lg font-bold text-white">
              {formatCurrency(analysis.profitPerOrder)} kr
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-lg p-3 text-center">
            <div className="text-xs text-white/60 mb-1">Kostnad/order</div>
            <div className="text-lg font-bold text-white/90">
              {formatCurrency(analysis.costPerOrder)} kr
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-lg p-3 text-center">
            <div className="text-xs text-white/60 mb-1">Ad Spend</div>
            <div className="text-lg font-bold text-white/90">
              {formatCurrency(adSpend)} kr
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

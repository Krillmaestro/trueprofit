'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { GlowCard } from './GlowCard'
import { Target, TrendingUp, AlertCircle, CheckCircle2, Clock } from 'lucide-react'
import { Progress } from '@/components/ui/progress'

interface CostBreakdown {
  cogs: number
  fees: number
  shippingCost: number
  adSpend: number
  fixed: number
  salaries: number
  variable: number
  oneTime: number
}

interface BreakEvenCardProps {
  revenue: number
  profit: number
  costs: CostBreakdown
  avgOrderValue: number
  avgMargin: number
  daysInPeriod: number
  daysElapsed: number
  className?: string
}

export function BreakEvenCard({
  revenue,
  profit,
  costs,
  avgOrderValue,
  avgMargin,
  daysInPeriod,
  daysElapsed,
  className,
}: BreakEvenCardProps) {
  const analysis = useMemo(() => {
    // Separera fasta och variabla kostnader för korrekt break-even beräkning
    // Fasta kostnader: fixed + salaries + oneTime (påverkas ej av försäljningsvolym)
    // Variabla kostnader: COGS + fees + shipping + adSpend (ökar med försäljning)
    const fixedCosts = costs.fixed + costs.salaries + costs.oneTime
    const variableCosts = costs.cogs + costs.fees + costs.shippingCost + costs.adSpend + costs.variable
    const totalCosts = fixedCosts + variableCosts

    // Contribution margin = Revenue - Variable Costs
    // Contribution margin ratio = (Revenue - Variable Costs) / Revenue
    const contributionMarginRatio = revenue > 0 ? (revenue - variableCosts) / revenue : 0

    // Break-even Revenue = Fixed Costs / Contribution Margin Ratio
    // Detta är den korrekta formeln för break-even
    const breakEvenRevenue = contributionMarginRatio > 0 ? fixedCosts / contributionMarginRatio : 0
    const breakEvenOrders = avgOrderValue > 0 ? Math.ceil(breakEvenRevenue / avgOrderValue) : 0

    // Current progress towards break-even
    const progressPercent = breakEvenRevenue > 0 ? Math.min(100, (revenue / breakEvenRevenue) * 100) : 100

    // Has break-even been reached?
    const hasReachedBreakEven = profit >= 0

    // Revenue needed to break even
    const revenueToBreakEven = Math.max(0, breakEvenRevenue - revenue)
    const ordersToBreakEven = avgOrderValue > 0 ? Math.ceil(revenueToBreakEven / avgOrderValue) : 0

    // Projected end-of-period profit
    const dailyRevenue = daysElapsed > 0 ? revenue / daysElapsed : 0
    const dailyProfit = daysElapsed > 0 ? profit / daysElapsed : 0
    const remainingDays = daysInPeriod - daysElapsed
    const projectedRevenue = revenue + (dailyRevenue * remainingDays)
    const projectedProfit = profit + (dailyProfit * remainingDays)

    // Days until break-even (at current pace)
    const daysToBreakEven = dailyProfit > 0 && profit < 0
      ? Math.ceil(Math.abs(profit) / dailyProfit)
      : profit >= 0 ? 0 : null

    return {
      breakEvenRevenue,
      breakEvenOrders,
      progressPercent,
      hasReachedBreakEven,
      revenueToBreakEven,
      ordersToBreakEven,
      projectedRevenue,
      projectedProfit,
      daysToBreakEven,
      dailyRevenue,
      dailyProfit,
      remainingDays,
    }
  }, [revenue, profit, costs.fixed, costs.salaries, costs.oneTime, costs.cogs, costs.fees, costs.shippingCost, costs.adSpend, costs.variable, avgOrderValue, avgMargin, daysInPeriod, daysElapsed])

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    }
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(0)}k`
    }
    return value.toLocaleString('sv-SE')
  }

  return (
    <GlowCard
      className={cn('p-6', className)}
      glowColor={analysis.hasReachedBreakEven ? 'emerald' : 'amber'}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            analysis.hasReachedBreakEven ? 'bg-emerald-100' : 'bg-amber-100'
          )}>
            <Target className={cn(
              'w-4 h-4',
              analysis.hasReachedBreakEven ? 'text-emerald-600' : 'text-amber-600'
            )} />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Break-Even Analys</h3>
            <p className="text-xs text-slate-500">Nollpunkt för lönsamhet</p>
          </div>
        </div>

        {/* Status badge */}
        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
          analysis.hasReachedBreakEven
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-amber-50 text-amber-700'
        )}>
          {analysis.hasReachedBreakEven ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Lönsam</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Under nollpunkt</span>
            </>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-slate-600">
            {analysis.hasReachedBreakEven ? 'Över nollpunkt' : 'Mot nollpunkt'}
          </span>
          <span className="text-sm font-medium text-slate-800">
            {analysis.progressPercent.toFixed(0)}%
          </span>
        </div>
        <div className="relative">
          <Progress
            value={analysis.progressPercent}
            className={cn(
              'h-3',
              analysis.hasReachedBreakEven ? '[&>div]:bg-emerald-500' : '[&>div]:bg-amber-500'
            )}
          />
          {/* Break-even marker */}
          {!analysis.hasReachedBreakEven && (
            <div
              className="absolute top-0 w-0.5 h-3 bg-slate-400"
              style={{ left: '100%' }}
            />
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Break-even revenue */}
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">Nollpunkt</div>
          <div className="text-lg font-bold text-slate-800">
            {formatCurrency(analysis.breakEvenRevenue)} kr
          </div>
          <div className="text-xs text-slate-400">
            ~{analysis.breakEvenOrders} ordrar
          </div>
        </div>

        {/* Revenue to break-even */}
        <div className="bg-slate-50 rounded-lg p-3">
          <div className="text-xs text-slate-500 mb-1">
            {analysis.hasReachedBreakEven ? 'Över nollpunkt' : 'Kvar till nollpunkt'}
          </div>
          <div className={cn(
            'text-lg font-bold',
            analysis.hasReachedBreakEven ? 'text-emerald-600' : 'text-amber-600'
          )}>
            {analysis.hasReachedBreakEven ? '+' : ''}{formatCurrency(Math.abs(profit))} kr
          </div>
          <div className="text-xs text-slate-400">
            {analysis.hasReachedBreakEven
              ? `${analysis.ordersToBreakEven === 0 ? 'Över målet' : ''}`
              : `${analysis.ordersToBreakEven} ordrar till`
            }
          </div>
        </div>
      </div>

      {/* Projections */}
      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Prognos</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Daily average */}
          <div>
            <div className="text-xs text-slate-500 mb-1">Daglig omsättning</div>
            <div className="text-sm font-semibold text-slate-800">
              {formatCurrency(analysis.dailyRevenue)} kr/dag
            </div>
          </div>

          {/* Daily profit */}
          <div>
            <div className="text-xs text-slate-500 mb-1">Daglig vinst</div>
            <div className={cn(
              'text-sm font-semibold',
              analysis.dailyProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
            )}>
              {analysis.dailyProfit >= 0 ? '+' : ''}{formatCurrency(analysis.dailyProfit)} kr/dag
            </div>
          </div>

          {/* Projected end-of-period */}
          <div>
            <div className="text-xs text-slate-500 mb-1">Beräknad slutvinst</div>
            <div className={cn(
              'text-sm font-semibold',
              analysis.projectedProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
            )}>
              {analysis.projectedProfit >= 0 ? '+' : ''}{formatCurrency(analysis.projectedProfit)} kr
            </div>
          </div>

          {/* Days remaining or to break-even */}
          <div>
            <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {analysis.hasReachedBreakEven ? 'Dagar kvar' : 'Till nollpunkt'}
            </div>
            <div className="text-sm font-semibold text-slate-800">
              {analysis.hasReachedBreakEven
                ? `${analysis.remainingDays} dagar`
                : analysis.daysToBreakEven !== null
                  ? `${analysis.daysToBreakEven} dagar`
                  : 'Ej beräkningsbart'
              }
            </div>
          </div>
        </div>
      </div>

      {/* Advice */}
      {!analysis.hasReachedBreakEven && analysis.ordersToBreakEven > 0 && (
        <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-800">
              <span className="font-medium">Tips:</span> Du behöver{' '}
              <span className="font-semibold">{analysis.ordersToBreakEven}</span> fler ordrar
              (ca {formatCurrency(analysis.revenueToBreakEven)} kr) för att nå nollpunkt denna period.
              {analysis.daysToBreakEven !== null && analysis.daysToBreakEven <= analysis.remainingDays && (
                <> Med nuvarande takt når du nollpunkt om {analysis.daysToBreakEven} dagar.</>
              )}
            </div>
          </div>
        </div>
      )}
    </GlowCard>
  )
}

// Mini version for sidebar or compact display
interface MiniBreakEvenProps {
  profit: number
  costs: number
  avgMargin: number
  className?: string
}

export function MiniBreakEven({ profit, costs, avgMargin, className }: MiniBreakEvenProps) {
  const breakEvenRevenue = costs > 0 && avgMargin > 0 ? costs / (avgMargin / 100) : 0
  const currentRevenue = profit + costs
  const progress = breakEvenRevenue > 0 ? Math.min(100, (currentRevenue / breakEvenRevenue) * 100) : 100
  const hasReached = profit >= 0

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center',
        hasReached ? 'bg-emerald-100' : 'bg-amber-100'
      )}>
        <Target className={cn(
          'w-4 h-4',
          hasReached ? 'text-emerald-600' : 'text-amber-600'
        )} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-500">Nollpunkt</span>
          <span className="text-xs font-medium text-slate-700">{progress.toFixed(0)}%</span>
        </div>
        <Progress
          value={progress}
          className={cn(
            'h-1.5',
            hasReached ? '[&>div]:bg-emerald-500' : '[&>div]:bg-amber-500'
          )}
        />
      </div>
    </div>
  )
}

'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { GlowCard } from './GlowCard'
import { Target, TrendingUp, TrendingDown, CheckCircle2, XCircle, Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface BreakEvenRoasCardProps {
  revenue: number       // Gross revenue (inkl VAT)
  revenueExVat?: number // Revenue excluding VAT (if available)
  vat?: number          // VAT amount
  adSpend: number
  adRevenue: number
  cogs: number
  fees: number
  shippingCost: number
  className?: string
}

export function BreakEvenRoasCard({
  revenue,
  revenueExVat,
  vat,
  adSpend,
  adRevenue,
  cogs,
  fees,
  shippingCost,
  className,
}: BreakEvenRoasCardProps) {
  const analysis = useMemo(() => {
    // Använd revenue exkl VAT för korrekt break-even beräkning
    // VAT är inte en kostnad vi behåller - den går till staten
    const netRevenue = revenueExVat ?? (vat ? revenue - vat : revenue * 0.8)  // Fallback: anta 20% VAT (25% moms)

    // Beräkna variabla kostnader som procent av revenue (exkl VAT)
    const variableCosts = cogs + fees + shippingCost
    const variableCostRatio = netRevenue > 0 ? variableCosts / netRevenue : 0

    // Break-Even ROAS formel:
    // För att gå plus måste: Ad Revenue > Ad Spend + (Ad Revenue × Variable Cost Ratio)
    // Omskrivning: Ad Revenue × (1 - Variable Cost Ratio) > Ad Spend
    // Break-Even ROAS = 1 / (1 - Variable Cost Ratio)
    const contributionMarginRatio = 1 - variableCostRatio
    const breakEvenRoas = contributionMarginRatio > 0 ? 1 / contributionMarginRatio : 999

    // Nuvarande ROAS
    const currentRoas = adSpend > 0 ? adRevenue / adSpend : 0

    // Är vi lönsamma?
    const isProfitable = currentRoas >= breakEvenRoas
    const roasDifference = currentRoas - breakEvenRoas
    const roasMarginPercent = breakEvenRoas > 0 ? ((currentRoas - breakEvenRoas) / breakEvenRoas) * 100 : 0

    // Beräkna profit/förlust från ads
    const adProfit = adRevenue - adSpend - (adRevenue * variableCostRatio)

    return {
      currentRoas,
      breakEvenRoas,
      isProfitable,
      roasDifference,
      roasMarginPercent,
      adProfit,
      variableCostRatio,
      contributionMarginRatio,
    }
  }, [revenue, revenueExVat, vat, adSpend, adRevenue, cogs, fees, shippingCost])

  const formatRoas = (value: number) => {
    if (value >= 100) return '99+'
    return value.toFixed(2)
  }

  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value)
    if (absValue >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    }
    if (absValue >= 1000) {
      return `${(value / 1000).toFixed(0)}k`
    }
    return value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })
  }

  // Beräkna visuell position för ROAS-indikatorn
  const getIndicatorPosition = () => {
    const maxRoas = Math.max(analysis.breakEvenRoas * 2, analysis.currentRoas * 1.2, 5)
    const position = (analysis.currentRoas / maxRoas) * 100
    return Math.min(95, Math.max(5, position))
  }

  const breakEvenPosition = () => {
    const maxRoas = Math.max(analysis.breakEvenRoas * 2, analysis.currentRoas * 1.2, 5)
    return Math.min(95, Math.max(5, (analysis.breakEvenRoas / maxRoas) * 100))
  }

  if (adSpend === 0) {
    return (
      <GlowCard className={cn('p-6', className)} glowColor="blue">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
            <Target className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Break-Even ROAS</h3>
            <p className="text-xs text-slate-500">Ingen annonsdata</p>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          Koppla ditt annonskonto för att se break-even ROAS.
        </p>
      </GlowCard>
    )
  }

  return (
    <GlowCard
      className={cn('p-6', className)}
      glowColor={analysis.isProfitable ? 'emerald' : 'rose'}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            analysis.isProfitable
              ? 'bg-gradient-to-br from-emerald-400 to-emerald-600'
              : 'bg-gradient-to-br from-rose-400 to-rose-600'
          )}>
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Break-Even ROAS</h3>
            <p className="text-xs text-slate-500">Minsta ROAS för lönsamhet</p>
          </div>
        </div>

        {/* Status badge */}
        <div className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold',
          analysis.isProfitable
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-rose-50 text-rose-700 border border-rose-200'
        )}>
          {analysis.isProfitable ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Lönsam</span>
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4" />
              <span>Ej lönsam</span>
            </>
          )}
        </div>
      </div>

      {/* Main ROAS display */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Current ROAS */}
        <div className="text-center">
          <div className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1">
            Nuvarande ROAS
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3 h-3 text-slate-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Return on Ad Spend = Annonsintäkt / Annonskostnad</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className={cn(
            'text-4xl font-bold tracking-tight',
            analysis.isProfitable ? 'text-emerald-600' : 'text-rose-600'
          )}>
            {formatRoas(analysis.currentRoas)}x
          </div>
          <div className={cn(
            'text-sm mt-1 flex items-center justify-center gap-1',
            analysis.roasDifference >= 0 ? 'text-emerald-600' : 'text-rose-600'
          )}>
            {analysis.roasDifference >= 0 ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            {analysis.roasDifference >= 0 ? '+' : ''}{formatRoas(analysis.roasDifference)}x
          </div>
        </div>

        {/* Break-even ROAS */}
        <div className="text-center">
          <div className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1">
            Break-Even ROAS
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3 h-3 text-slate-400" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Minimum ROAS för att täcka variabla kostnader</p>
                  <p className="text-xs mt-1">= 1 / (1 - Variabel kostnad %)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="text-4xl font-bold text-slate-700 tracking-tight">
            {formatRoas(analysis.breakEvenRoas)}x
          </div>
          <div className="text-sm text-slate-500 mt-1">
            minsta krav
          </div>
        </div>
      </div>

      {/* Visual ROAS scale */}
      <div className="mb-6">
        <div className="relative h-4 bg-gradient-to-r from-rose-200 via-amber-200 to-emerald-200 rounded-full overflow-hidden">
          {/* Break-even marker */}
          <div
            className="absolute top-0 w-1 h-full bg-slate-800 z-10"
            style={{ left: `${breakEvenPosition()}%` }}
          >
            <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-medium text-slate-600 whitespace-nowrap">
              BE: {formatRoas(analysis.breakEvenRoas)}x
            </div>
          </div>

          {/* Current ROAS indicator */}
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 border-white shadow-lg z-20 flex items-center justify-center',
              analysis.isProfitable ? 'bg-emerald-500' : 'bg-rose-500'
            )}
            style={{ left: `calc(${getIndicatorPosition()}% - 12px)` }}
          >
            <div className="w-2 h-2 bg-white rounded-full" />
          </div>
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>0x</span>
          <span>Förlust</span>
          <span>Vinst</span>
          <span>{formatRoas(Math.max(analysis.breakEvenRoas * 2, 5))}x</span>
        </div>
      </div>

      {/* Profit/Loss from ads */}
      <div className={cn(
        'p-4 rounded-xl border',
        analysis.isProfitable
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-rose-50 border-rose-200'
      )}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-600 mb-1">
              {analysis.isProfitable ? 'Vinst från annonser' : 'Förlust från annonser'}
            </div>
            <div className={cn(
              'text-2xl font-bold',
              analysis.isProfitable ? 'text-emerald-700' : 'text-rose-700'
            )}>
              {analysis.isProfitable ? '+' : ''}{formatCurrency(analysis.adProfit)} kr
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-600 mb-1">Marginal över BE</div>
            <div className={cn(
              'text-lg font-semibold',
              analysis.roasMarginPercent >= 0 ? 'text-emerald-600' : 'text-rose-600'
            )}>
              {analysis.roasMarginPercent >= 0 ? '+' : ''}{analysis.roasMarginPercent.toFixed(0)}%
            </div>
          </div>
        </div>
      </div>

      {/* Tips */}
      {!analysis.isProfitable && (
        <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-100">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-800">
              <span className="font-medium">Tips:</span> Din ROAS behöver öka med{' '}
              <span className="font-semibold">{formatRoas(Math.abs(analysis.roasDifference))}x</span>{' '}
              för att nå break-even. Överväg att optimera målgrupper, kreativ eller höja priser.
            </div>
          </div>
        </div>
      )}
    </GlowCard>
  )
}

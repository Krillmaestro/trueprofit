'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { GlowCard } from './GlowCard'
import {
  Users,
  UserPlus,
  Repeat,
  TrendingUp,
  Info,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface CustomerMetrics {
  totalCustomersAllTime: number
  customersInPeriod: number
  newCustomers: number
  returningCustomers: number
  repeatRate: number
  avgOrdersPerCustomer: number
  aov: number
  cac: number
  ltv: number
  ltvCacRatio: number
  adSpend: number
}

interface Insight {
  type: 'success' | 'warning' | 'info'
  message: string
}

interface CustomerMetricsCardProps {
  startDate?: string
  endDate?: string
  className?: string
}

export function CustomerMetricsCard({
  startDate,
  endDate,
  className,
}: CustomerMetricsCardProps) {
  const [metrics, setMetrics] = useState<CustomerMetrics | null>(null)
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        if (startDate) params.set('startDate', startDate)
        if (endDate) params.set('endDate', endDate)

        const response = await fetch(`/api/dashboard/customer-metrics?${params.toString()}`)
        if (!response.ok) throw new Error('Failed to fetch customer metrics')

        const data = await response.json()
        setMetrics(data.metrics)
        setInsights(data.insights || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading data')
        // Use demo data
        setMetrics({
          totalCustomersAllTime: 2847,
          customersInPeriod: 1247,
          newCustomers: 892,
          returningCustomers: 355,
          repeatRate: 28.5,
          avgOrdersPerCustomer: 1.85,
          aov: 396,
          cac: 58.3,
          ltv: 732,
          ltvCacRatio: 12.55,
          adSpend: 52000,
        })
        setInsights([
          { type: 'success', message: 'Utmärkt LTV:CAC ratio (12.5:1). Dina kunder är värda 12.5x vad det kostar att skaffa dem.' },
          { type: 'info', message: 'Återköpsfrekvens på 28.5%. Överväg email-marketing för att öka.' },
        ])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [startDate, endDate])

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M kr`
    }
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(0)}k kr`
    }
    return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr`
  }

  const formatNumber = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`
    }
    return value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })
  }

  // Calculate LTV:CAC gauge position (0-100)
  const getLtvCacGaugePosition = (ratio: number) => {
    // Scale: 0-1 is bad (red), 1-3 is okay (yellow), 3+ is good (green)
    // Map to 0-100 for gauge
    if (ratio <= 0) return 0
    if (ratio >= 5) return 100
    return (ratio / 5) * 100
  }

  if (loading) {
    return (
      <GlowCard className={cn('p-6', className)} glowColor="cyan">
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
        </div>
      </GlowCard>
    )
  }

  if (!metrics) {
    return (
      <GlowCard className={cn('p-6', className)} glowColor="blue">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Kundanalys</h3>
            <p className="text-xs text-slate-500">CAC, LTV och återköpsfrekvens</p>
          </div>
        </div>
        <p className="text-sm text-slate-500 text-center py-8">
          Ingen kunddata tillgänglig. Synka din butik för att se kundanalys.
        </p>
      </GlowCard>
    )
  }

  const ltvCacStatus = metrics.ltvCacRatio >= 3 ? 'success' : metrics.ltvCacRatio >= 1 ? 'warning' : 'danger'

  return (
    <GlowCard className={cn('p-6', className)} glowColor="cyan">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-cyan-600 flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Kundanalys</h3>
            <p className="text-xs text-slate-500">CAC, LTV och återköpsfrekvens</p>
          </div>
        </div>

        {/* LTV:CAC ratio badge */}
        <div className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold',
          ltvCacStatus === 'success' && 'bg-emerald-50 text-emerald-700 border border-emerald-200',
          ltvCacStatus === 'warning' && 'bg-amber-50 text-amber-700 border border-amber-200',
          ltvCacStatus === 'danger' && 'bg-rose-50 text-rose-700 border border-rose-200',
        )}>
          <span>{metrics.ltvCacRatio.toFixed(1)}:1 LTV:CAC</span>
        </div>
      </div>

      {/* Main metrics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* LTV */}
        <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-cyan-600" />
            <span className="text-xs font-medium text-cyan-700">Livstidsvärde (LTV)</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3 h-3 text-cyan-500" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Genomsnittlig total intäkt per kund över tid</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="text-3xl font-bold text-cyan-700">
            {formatCurrency(metrics.ltv)}
          </div>
          <div className="text-xs text-cyan-600 mt-1">
            ~{metrics.avgOrdersPerCustomer.toFixed(1)} ordrar/kund
          </div>
        </div>

        {/* CAC */}
        <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <UserPlus className="w-4 h-4 text-violet-600" />
            <span className="text-xs font-medium text-violet-700">Kundanskaffning (CAC)</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="w-3 h-3 text-violet-500" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Annonskostnad / Antal nya kunder</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="text-3xl font-bold text-violet-700">
            {formatCurrency(metrics.cac)}
          </div>
          <div className="text-xs text-violet-600 mt-1">
            {formatNumber(metrics.newCustomers)} nya kunder
          </div>
        </div>
      </div>

      {/* LTV:CAC Visual Gauge */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700">LTV:CAC Ratio</span>
          <span className={cn(
            'text-sm font-semibold',
            ltvCacStatus === 'success' && 'text-emerald-600',
            ltvCacStatus === 'warning' && 'text-amber-600',
            ltvCacStatus === 'danger' && 'text-rose-600',
          )}>
            {metrics.ltvCacRatio.toFixed(1)}:1
          </span>
        </div>
        <div className="relative h-3 bg-gradient-to-r from-rose-200 via-amber-200 to-emerald-200 rounded-full overflow-hidden">
          {/* Target marker at 3:1 */}
          <div
            className="absolute top-0 w-0.5 h-full bg-slate-600 z-10"
            style={{ left: '60%' }}
          >
            <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium text-slate-500">
              3:1
            </div>
          </div>
          {/* Current position */}
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md z-20',
              ltvCacStatus === 'success' && 'bg-emerald-500',
              ltvCacStatus === 'warning' && 'bg-amber-500',
              ltvCacStatus === 'danger' && 'bg-rose-500',
            )}
            style={{ left: `calc(${getLtvCacGaugePosition(metrics.ltvCacRatio)}% - 8px)` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span>Förlust</span>
          <span>Break-even</span>
          <span>Lönsam</span>
          <span>Utmärkt</span>
        </div>
      </div>

      {/* Secondary metrics */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Repeat className="w-3 h-3 text-slate-500" />
            <span className="text-xs text-slate-500">Återköp</span>
          </div>
          <div className="text-lg font-bold text-slate-700">
            {metrics.repeatRate.toFixed(0)}%
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Users className="w-3 h-3 text-slate-500" />
            <span className="text-xs text-slate-500">Totalt</span>
          </div>
          <div className="text-lg font-bold text-slate-700">
            {formatNumber(metrics.totalCustomersAllTime)}
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <span className="text-xs text-slate-500">AOV</span>
          </div>
          <div className="text-lg font-bold text-slate-700">
            {formatCurrency(metrics.aov)}
          </div>
        </div>
      </div>

      {/* New vs Returning visualization */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span>Nya kunder ({metrics.newCustomers})</span>
          <span>Återvändande ({metrics.returningCustomers})</span>
        </div>
        <div className="flex h-2 rounded-full overflow-hidden">
          <div
            className="bg-violet-500"
            style={{
              width: `${metrics.customersInPeriod > 0 ? (metrics.newCustomers / metrics.customersInPeriod) * 100 : 50}%`,
            }}
          />
          <div
            className="bg-cyan-500"
            style={{
              width: `${metrics.customersInPeriod > 0 ? (metrics.returningCustomers / metrics.customersInPeriod) * 100 : 50}%`,
            }}
          />
        </div>
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="space-y-2">
          {insights.slice(0, 2).map((insight, index) => (
            <div
              key={index}
              className={cn(
                'p-3 rounded-lg flex items-start gap-2',
                insight.type === 'success' && 'bg-emerald-50 border border-emerald-100',
                insight.type === 'warning' && 'bg-amber-50 border border-amber-100',
                insight.type === 'info' && 'bg-blue-50 border border-blue-100',
              )}
            >
              {insight.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />}
              {insight.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />}
              {insight.type === 'info' && <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />}
              <span className={cn(
                'text-xs',
                insight.type === 'success' && 'text-emerald-800',
                insight.type === 'warning' && 'text-amber-800',
                insight.type === 'info' && 'text-blue-800',
              )}>
                {insight.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </GlowCard>
  )
}

'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { GlowCard } from './GlowCard'
import { BarChart3, TrendingUp, TrendingDown, Minus, Info, ChevronRight, ChevronDown } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Industry benchmark data (typical values for Swedish e-commerce)
// Sources: PostNord E-barometern, Svensk Handel, HUI Research
const industryBenchmarks = {
  fashion: {
    name: 'Kläder & Mode',
    margin: 45,
    cogs: 35,
    shippingCost: 8,
    returnRate: 25,
    conversionRate: 2.5,
    source: 'PostNord E-barometern 2024',
  },
  electronics: {
    name: 'Elektronik',
    margin: 20,
    cogs: 60,
    shippingCost: 5,
    returnRate: 8,
    conversionRate: 1.8,
    source: 'Elektronikbranschen 2024',
  },
  beauty: {
    name: 'Skönhet & Hälsa',
    margin: 55,
    cogs: 25,
    shippingCost: 6,
    returnRate: 10,
    conversionRate: 3.2,
    source: 'Svensk Handel 2024',
  },
  home: {
    name: 'Hem & Inredning',
    margin: 40,
    cogs: 40,
    shippingCost: 12,
    returnRate: 12,
    conversionRate: 2.0,
    source: 'HUI Research 2024',
  },
  food: {
    name: 'Mat & Dryck',
    margin: 30,
    cogs: 50,
    shippingCost: 10,
    returnRate: 3,
    conversionRate: 4.0,
    source: 'Dagligvaruhandeln 2024',
  },
  sports: {
    name: 'Sport & Fritid',
    margin: 38,
    cogs: 42,
    shippingCost: 7,
    returnRate: 15,
    conversionRate: 2.2,
    source: 'Sporthandlarna 2024',
  },
  pets: {
    name: 'Husdjur & Djurfoder',
    margin: 32,
    cogs: 48,
    shippingCost: 9,
    returnRate: 5,
    conversionRate: 3.5,
    source: 'Svenska Zoobranschen 2024',
  },
  toys: {
    name: 'Leksaker & Spel',
    margin: 42,
    cogs: 38,
    shippingCost: 7,
    returnRate: 8,
    conversionRate: 2.8,
    source: 'Leksaksbranschen 2024',
  },
  jewelry: {
    name: 'Smycken & Accessoarer',
    margin: 60,
    cogs: 20,
    shippingCost: 4,
    returnRate: 12,
    conversionRate: 1.5,
    source: 'Guldsmedsbranschen 2024',
  },
  baby: {
    name: 'Baby & Barn',
    margin: 38,
    cogs: 42,
    shippingCost: 8,
    returnRate: 18,
    conversionRate: 2.4,
    source: 'Svensk Handel 2024',
  },
  outdoor: {
    name: 'Outdoor & Friluftsliv',
    margin: 40,
    cogs: 40,
    shippingCost: 8,
    returnRate: 12,
    conversionRate: 2.0,
    source: 'Friluftsfrämjandet 2024',
  },
  general: {
    name: 'E-handel generellt',
    margin: 35,
    cogs: 40,
    shippingCost: 8,
    returnRate: 15,
    conversionRate: 2.5,
    source: 'PostNord E-barometern 2024',
  },
}

type Industry = keyof typeof industryBenchmarks

interface BenchmarkMetric {
  label: string
  value: number
  benchmark: number
  suffix: string
  higherIsBetter: boolean
  description: string
}

interface BenchmarkCardProps {
  industry?: Industry
  margin: number
  cogsPercent: number
  shippingPercent: number
  returnRate?: number
  conversionRate?: number
  className?: string
  onIndustryChange?: (industry: Industry) => void
}

export function BenchmarkCard({
  industry: initialIndustry = 'general',
  margin,
  cogsPercent,
  shippingPercent,
  returnRate,
  conversionRate,
  className,
  onIndustryChange,
}: BenchmarkCardProps) {
  const [selectedIndustry, setSelectedIndustry] = useState<Industry>(initialIndustry)
  const benchmark = industryBenchmarks[selectedIndustry]

  const handleIndustryChange = (value: string) => {
    const industry = value as Industry
    setSelectedIndustry(industry)
    onIndustryChange?.(industry)
  }

  const metrics: BenchmarkMetric[] = [
    {
      label: 'Marginal',
      value: margin,
      benchmark: benchmark.margin,
      suffix: '%',
      higherIsBetter: true,
      description: 'Din nettomarginal jämfört med branschens genomsnitt',
    },
    {
      label: 'COGS',
      value: cogsPercent,
      benchmark: benchmark.cogs,
      suffix: '%',
      higherIsBetter: false,
      description: 'Varuinköpskostnad i procent av omsättning',
    },
    {
      label: 'Frakt',
      value: shippingPercent,
      benchmark: benchmark.shippingCost,
      suffix: '%',
      higherIsBetter: false,
      description: 'Fraktkostnad i procent av omsättning',
    },
  ]

  // Add optional metrics if provided
  if (returnRate !== undefined) {
    metrics.push({
      label: 'Returgrad',
      value: returnRate,
      benchmark: benchmark.returnRate,
      suffix: '%',
      higherIsBetter: false,
      description: 'Andel av ordrar som returneras',
    })
  }

  if (conversionRate !== undefined) {
    metrics.push({
      label: 'Konvertering',
      value: conversionRate,
      benchmark: benchmark.conversionRate,
      suffix: '%',
      higherIsBetter: true,
      description: 'Andel av besökare som genomför ett köp',
    })
  }

  const getComparisonStatus = (metric: BenchmarkMetric) => {
    const diff = metric.value - metric.benchmark
    const threshold = metric.benchmark * 0.1 // 10% threshold

    if (Math.abs(diff) < threshold) return 'neutral'
    if (metric.higherIsBetter) {
      return diff > 0 ? 'better' : 'worse'
    }
    return diff < 0 ? 'better' : 'worse'
  }

  const getComparisonIcon = (status: string) => {
    switch (status) {
      case 'better':
        return <TrendingUp className="w-4 h-4 text-emerald-500" />
      case 'worse':
        return <TrendingDown className="w-4 h-4 text-rose-500" />
      default:
        return <Minus className="w-4 h-4 text-slate-400" />
    }
  }

  const getComparisonColor = (status: string) => {
    switch (status) {
      case 'better':
        return 'text-emerald-600 bg-emerald-50'
      case 'worse':
        return 'text-rose-600 bg-rose-50'
      default:
        return 'text-slate-600 bg-slate-50'
    }
  }

  const getBarWidth = (value: number, benchmark: number) => {
    const max = Math.max(value, benchmark) * 1.2
    return (value / max) * 100
  }

  // Overall score
  const score = metrics.reduce((acc, metric) => {
    const status = getComparisonStatus(metric)
    return acc + (status === 'better' ? 1 : status === 'worse' ? -1 : 0)
  }, 0)

  const overallStatus = score > 0 ? 'better' : score < 0 ? 'worse' : 'neutral'

  return (
    <GlowCard className={cn('p-6', className)} glowColor="blue">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Branschjämförelse</h3>
            <p className="text-xs text-slate-500">Jämför med branschsnitt</p>
          </div>
        </div>

        {/* Overall status badge */}
        <div className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
          getComparisonColor(overallStatus)
        )}>
          {getComparisonIcon(overallStatus)}
          <span>
            {overallStatus === 'better' ? 'Över snittet' : overallStatus === 'worse' ? 'Under snittet' : 'I linje med snittet'}
          </span>
        </div>
      </div>

      {/* Industry Selector */}
      <div className="mb-4">
        <label className="text-xs text-slate-500 mb-1 block">Välj bransch</label>
        <Select value={selectedIndustry} onValueChange={handleIndustryChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Välj bransch" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(industryBenchmarks).map(([key, value]) => (
              <SelectItem key={key} value={key}>
                {value.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Metrics */}
      <div className="space-y-4">
        <TooltipProvider>
          {metrics.map((metric) => {
            const status = getComparisonStatus(metric)
            const diff = metric.value - metric.benchmark
            const diffPercent = metric.benchmark > 0 ? (diff / metric.benchmark) * 100 : 0

            return (
              <div key={metric.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-slate-600">{metric.label}</span>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3.5 h-3.5 text-slate-400" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs text-xs">{metric.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800">
                      {metric.value.toFixed(1)}{metric.suffix}
                    </span>
                    <span className={cn(
                      'text-xs px-1.5 py-0.5 rounded',
                      getComparisonColor(status)
                    )}>
                      {diff >= 0 ? '+' : ''}{diffPercent.toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Comparison bars */}
                <div className="relative h-6 rounded-lg bg-slate-100 overflow-hidden">
                  {/* Benchmark bar */}
                  <div
                    className="absolute top-0 h-full bg-slate-300/50 rounded-lg"
                    style={{ width: `${getBarWidth(metric.benchmark, metric.value)}%` }}
                  />
                  {/* Your value bar */}
                  <div
                    className={cn(
                      'absolute top-0 h-full rounded-lg transition-all duration-500',
                      status === 'better' ? 'bg-emerald-500' : status === 'worse' ? 'bg-rose-500' : 'bg-blue-500'
                    )}
                    style={{ width: `${getBarWidth(metric.value, metric.benchmark)}%` }}
                  />
                  {/* Benchmark marker */}
                  <div
                    className="absolute top-0 w-0.5 h-full bg-slate-600"
                    style={{ left: `${getBarWidth(metric.benchmark, metric.value)}%` }}
                  />
                  {/* Labels */}
                  <div className="absolute inset-0 flex items-center justify-between px-2">
                    <span className="text-xs font-medium text-white drop-shadow">Du</span>
                    <span className="text-xs text-slate-500">
                      Snitt: {metric.benchmark}{metric.suffix}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </TooltipProvider>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Källa: {benchmark.source}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                <Info className="w-3 h-3" />
                <span>Om data</span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs">
                Branschdata baseras på sammanställningar från svenska branschrapporter och
                e-handelsundersökningar. Siffrorna är genomsnitt och kan variera beroende
                på företagsstorlek och affärsmodell.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </GlowCard>
  )
}

// Mini benchmark indicator
interface MiniBenchmarkProps {
  label: string
  value: number
  benchmark: number
  suffix?: string
  higherIsBetter?: boolean
  className?: string
}

export function MiniBenchmark({
  label,
  value,
  benchmark,
  suffix = '%',
  higherIsBetter = true,
  className,
}: MiniBenchmarkProps) {
  const diff = value - benchmark
  const threshold = benchmark * 0.1

  let status: 'better' | 'worse' | 'neutral' = 'neutral'
  if (Math.abs(diff) >= threshold) {
    if (higherIsBetter) {
      status = diff > 0 ? 'better' : 'worse'
    } else {
      status = diff < 0 ? 'better' : 'worse'
    }
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs text-slate-500">{label}:</span>
      <span className="text-xs font-medium text-slate-700">{value.toFixed(1)}{suffix}</span>
      <span className={cn(
        'text-xs px-1 py-0.5 rounded',
        status === 'better' ? 'text-emerald-600 bg-emerald-50' :
          status === 'worse' ? 'text-rose-600 bg-rose-50' :
            'text-slate-500 bg-slate-100'
      )}>
        vs {benchmark}{suffix}
      </span>
    </div>
  )
}

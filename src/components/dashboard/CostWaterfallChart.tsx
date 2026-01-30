'use client'

import { GlowCard } from './GlowCard'

interface CostItem {
  name: string
  value: number
  color: string
}

interface CostWaterfallChartProps {
  data: CostItem[]
  total: number
  loading?: boolean
}

export function CostWaterfallChart({ data, total, loading }: CostWaterfallChartProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}k`
    }
    return value.toFixed(0)
  }

  const maxValue = Math.max(...data.map((d) => d.value))

  if (loading) {
    return (
      <GlowCard className="p-6" hover={false}>
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-40 mb-6" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 bg-slate-200 rounded w-20" />
                <div className="flex-1 h-8 bg-slate-100 rounded-lg" />
                <div className="h-4 bg-slate-200 rounded w-16" />
              </div>
            ))}
          </div>
        </div>
      </GlowCard>
    )
  }

  return (
    <GlowCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Cost Breakdown</h2>
          <p className="text-sm text-slate-500 mt-0.5">Where your money goes</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">Total</div>
          <div className="text-lg font-bold text-slate-800">{formatCurrency(total)} kr</div>
        </div>
      </div>

      <div className="space-y-3">
        {data.map((item) => {
          const percentage = total > 0 ? (item.value / total) * 100 : 0
          const barWidth = maxValue > 0 ? (item.value / maxValue) * 100 : 0

          return (
            <div key={item.name} className="group">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm font-medium text-slate-700">{item.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-800">
                    {formatCurrency(item.value)} kr
                  </span>
                  <span className="text-xs text-slate-400 w-10 text-right">
                    {percentage.toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Bar */}
              <div className="relative h-8 bg-slate-100 rounded-lg overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500 ease-out group-hover:opacity-90"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: item.color,
                  }}
                />
                {/* Subtle gradient overlay */}
                <div
                  className="absolute inset-y-0 left-0 rounded-lg opacity-30"
                  style={{
                    width: `${barWidth}%`,
                    background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)`,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Visual pie indicator */}
      <div className="mt-6 pt-6 border-t border-slate-100">
        <div className="flex items-center gap-3 flex-wrap">
          {data.slice(0, 5).map((item) => (
            <div key={item.name} className="flex items-center gap-1.5">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-slate-500">{item.name}</span>
            </div>
          ))}
          {data.length > 5 && (
            <span className="text-xs text-slate-400">+{data.length - 5} more</span>
          )}
        </div>
      </div>
    </GlowCard>
  )
}

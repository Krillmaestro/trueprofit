'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { GlowCard } from './GlowCard'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

interface ProfitPieChartProps {
  revenue: number
  costs: {
    vat: number
    cogs: number
    shipping: number
    fees: number
    adSpend: number
    fixed: number
    salaries: number
    variable: number
    oneTime: number
  }
  profit: number
  className?: string
}

export function ProfitPieChart({
  revenue,
  costs,
  profit,
  className,
}: ProfitPieChartProps) {
  const data = useMemo(() => {
    const items = [
      { name: 'Vinst', value: Math.max(0, profit), color: '#10b981', category: 'profit' },
      { name: 'Moms (VAT)', value: costs.vat, color: '#ef4444', category: 'cost' },
      { name: 'COGS', value: costs.cogs, color: '#3b82f6', category: 'cost' },
      { name: 'Ad Spend', value: costs.adSpend, color: '#8b5cf6', category: 'cost' },
      { name: 'Frakt', value: costs.shipping, color: '#ec4899', category: 'cost' },
      { name: 'Avgifter', value: costs.fees, color: '#f59e0b', category: 'cost' },
      { name: 'Fasta', value: costs.fixed, color: '#06b6d4', category: 'cost' },
      { name: 'Löner', value: costs.salaries, color: '#22c55e', category: 'cost' },
      { name: 'Variabla', value: costs.variable, color: '#64748b', category: 'cost' },
      { name: 'Engång', value: costs.oneTime, color: '#14b8a6', category: 'cost' },
    ].filter(item => item.value > 0)

    // If we have a loss, show it as a cost item
    if (profit < 0) {
      // Remove the profit item (it's 0 now)
      const withoutProfit = items.filter(item => item.category !== 'profit')
      // Add a loss indicator
      withoutProfit.unshift({
        name: 'Förlust',
        value: Math.abs(profit),
        color: '#dc2626',
        category: 'loss',
      })
      return withoutProfit
    }

    return items
  }, [costs, profit])

  const totalCosts = Object.values(costs).reduce((sum, val) => sum + val, 0)
  const profitPercent = revenue > 0 ? (profit / revenue) * 100 : 0
  const costsPercent = revenue > 0 ? (totalCosts / revenue) * 100 : 0

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M kr`
    }
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(0)}k kr`
    }
    return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 0 })} kr`
  }

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: { color: string } }> }) => {
    if (!active || !payload || !payload.length) return null

    const item = payload[0]
    const percent = revenue > 0 ? (item.value / revenue) * 100 : 0

    return (
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 p-4" style={{ zIndex: 9999 }}>
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-5 h-5 rounded-full shadow-md ring-2 ring-white"
            style={{ backgroundColor: item.payload.color }}
          />
          <span className="font-bold text-slate-900 text-lg">{item.name}</span>
        </div>
        <div className="text-2xl font-bold text-slate-900 mb-1">{formatCurrency(item.value)}</div>
        <div className="text-base font-semibold text-slate-600">{percent.toFixed(1)}% av omsättning</div>
      </div>
    )
  }

  const renderLegend = () => {
    return (
      <div className="grid grid-cols-2 gap-2 mt-4">
        {data.slice(0, 6).map((item) => {
          const percent = revenue > 0 ? (item.value / revenue) * 100 : 0
          return (
            <div key={item.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs text-slate-600 truncate">{item.name}</span>
              <span className="text-xs font-medium text-slate-800 ml-auto">{percent.toFixed(0)}%</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <GlowCard className={cn('p-6', className)} glowColor={profit >= 0 ? 'emerald' : 'rose'}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-800">Intäktsfördelning</h3>
          <p className="text-xs text-slate-500">Vart pengarna går</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">Omsättning</div>
          <div className="text-lg font-bold text-slate-800">{formatCurrency(revenue)}</div>
        </div>
      </div>

      {/* Pie Chart with center label */}
      <div className="h-64 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={<CustomTooltip />}
              wrapperStyle={{ zIndex: 9999, pointerEvents: 'none' }}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label - positioned inside the donut hole with solid background */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 1 }}>
          <div className="text-center bg-white rounded-full w-24 h-24 flex flex-col items-center justify-center shadow-lg border border-slate-100">
            <div className={cn(
              'text-3xl font-bold leading-none',
              profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
            )}>
              {profitPercent.toFixed(0)}%
            </div>
            <div className="text-xs text-slate-500 mt-1 font-semibold uppercase tracking-wider">
              {profit >= 0 ? 'vinst' : 'förlust'}
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-100">
        <div className="text-center">
          <div className="text-sm text-slate-500">Kostnader</div>
          <div className="text-lg font-bold text-slate-700">{formatCurrency(totalCosts)}</div>
          <div className="text-xs text-slate-400">{costsPercent.toFixed(0)}%</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-slate-500">Vinst</div>
          <div className={cn(
            'text-lg font-bold',
            profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
          )}>
            {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
          </div>
          <div className="text-xs text-slate-400">{profitPercent.toFixed(0)}%</div>
        </div>
      </div>

      {/* Legend */}
      {renderLegend()}
    </GlowCard>
  )
}

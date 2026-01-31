'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { GlowCard } from './GlowCard'

interface DataPoint {
  date: string
  revenue: number
  costs: number
  profit: number
}

interface RevenueFlowChartProps {
  data: DataPoint[]
  loading?: boolean
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

interface TooltipPayloadEntry {
  name: string
  value: number
  color: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-slate-200/60">
        <p className="text-sm font-semibold text-slate-800 mb-2">{label}</p>
        <div className="space-y-1.5">
          {payload.map((entry, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-sm text-slate-600">{entry.name}</span>
              </div>
              <span className="text-sm font-medium text-slate-800">
                {formatCurrency(entry.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  return null
}

export function RevenueFlowChart({ data, loading }: RevenueFlowChartProps) {
  if (loading) {
    return (
      <GlowCard className="p-6" hover={false}>
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-48 mb-6" />
          <div className="h-[280px] bg-slate-100 rounded-xl" />
        </div>
      </GlowCard>
    )
  }

  // Handle empty or single data point - show summary instead of chart
  if (!data || data.length === 0) {
    return (
      <GlowCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Revenue Flow</h2>
            <p className="text-sm text-slate-500 mt-0.5">Revenue, costs & profit over time</p>
          </div>
        </div>
        <div className="h-[280px] flex items-center justify-center">
          <p className="text-slate-400">Ingen data för vald period</p>
        </div>
      </GlowCard>
    )
  }

  // For single day, show a bar-style summary instead
  if (data.length === 1) {
    const day = data[0]
    const maxValue = Math.max(day.revenue, day.costs, Math.abs(day.profit))

    return (
      <GlowCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Dagens Resultat</h2>
            <p className="text-sm text-slate-500 mt-0.5">{day.date}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-sm text-slate-600">Revenue</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-rose-500" />
              <span className="text-sm text-slate-600">Costs</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-sm text-slate-600">Profit</span>
            </div>
          </div>
        </div>
        <div className="space-y-6">
          {/* Revenue Bar */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600 font-medium">Omsättning</span>
              <span className="font-bold text-blue-600">{formatCurrency(day.revenue)}</span>
            </div>
            <div className="h-8 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-400 to-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${maxValue > 0 ? (day.revenue / maxValue) * 100 : 0}%` }}
              />
            </div>
          </div>
          {/* Costs Bar */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600 font-medium">Kostnader</span>
              <span className="font-bold text-rose-600">{formatCurrency(day.costs)}</span>
            </div>
            <div className="h-8 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-rose-400 to-rose-600 rounded-full transition-all duration-500"
                style={{ width: `${maxValue > 0 ? (day.costs / maxValue) * 100 : 0}%` }}
              />
            </div>
          </div>
          {/* Profit Bar */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-slate-600 font-medium">Vinst</span>
              <span className={`font-bold ${day.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {day.profit >= 0 ? '+' : ''}{formatCurrency(day.profit)}
              </span>
            </div>
            <div className="h-8 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  day.profit >= 0
                    ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                    : 'bg-gradient-to-r from-rose-400 to-rose-600'
                }`}
                style={{ width: `${maxValue > 0 ? (Math.abs(day.profit) / maxValue) * 100 : 0}%` }}
              />
            </div>
          </div>
          {/* Margin indicator */}
          <div className="pt-4 border-t border-slate-100">
            <div className="flex items-center justify-center gap-3">
              <div className={`text-3xl font-bold ${day.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {day.revenue > 0 ? ((day.profit / day.revenue) * 100).toFixed(1) : 0}%
              </div>
              <div className="text-slate-500 text-sm">vinstmarginal</div>
            </div>
          </div>
        </div>
      </GlowCard>
    )
  }

  return (
    <GlowCard className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Revenue Flow</h2>
          <p className="text-sm text-slate-500 mt-0.5">Revenue, costs & profit over time</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm text-slate-600">Revenue</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-rose-500" />
            <span className="text-sm text-slate-600">Costs</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="text-sm text-slate-600">Profit</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="costsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#94a3b8' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="revenue"
            name="Revenue"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#revenueGradient)"
          />
          <Area
            type="monotone"
            dataKey="costs"
            name="Costs"
            stroke="#f43f5e"
            strokeWidth={2}
            fill="url(#costsGradient)"
          />
          <Area
            type="monotone"
            dataKey="profit"
            name="Profit"
            stroke="#22c55e"
            strokeWidth={2.5}
            fill="url(#profitGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </GlowCard>
  )
}

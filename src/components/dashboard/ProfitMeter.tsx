'use client'

import { cn } from '@/lib/utils'

interface ProfitMeterProps {
  revenue: number
  costs: number
  profit: number
  className?: string
}

export function ProfitMeter({ revenue, costs, profit, className }: ProfitMeterProps) {
  const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0
  const costRatio = revenue > 0 ? (costs / revenue) * 100 : 0

  // Calculate needle rotation (-90 = far left/loss, 0 = center, 90 = far right/profit)
  // Map profit margin from -50% to +50% onto -90 to +90 degrees
  const clampedMargin = Math.max(-50, Math.min(50, profitMargin))
  const needleRotation = (clampedMargin / 50) * 90

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}k`
    }
    return value.toFixed(0)
  }

  return (
    <div className={cn('relative', className)}>
      {/* Gauge Background */}
      <svg viewBox="0 0 200 120" className="w-full">
        <defs>
          <linearGradient id="gaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="30%" stopColor="#f97316" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="70%" stopColor="#84cc16" />
            <stop offset="100%" stopColor="#22c55e" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="12"
          strokeLinecap="round"
        />

        {/* Colored arc */}
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="url(#gaugeGradient)"
          strokeWidth="12"
          strokeLinecap="round"
          className="opacity-90"
        />

        {/* Tick marks */}
        {[-90, -60, -30, 0, 30, 60, 90].map((angle, i) => {
          const rad = (angle * Math.PI) / 180
          const x1 = 100 + 70 * Math.cos(rad - Math.PI)
          const y1 = 100 + 70 * Math.sin(rad - Math.PI)
          const x2 = 100 + 60 * Math.cos(rad - Math.PI)
          const y2 = 100 + 60 * Math.sin(rad - Math.PI)
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#94a3b8"
              strokeWidth="1"
            />
          )
        })}

        {/* Needle */}
        <g transform={`rotate(${needleRotation}, 100, 100)`} filter="url(#glow)">
          <path
            d="M 98 100 L 100 30 L 102 100 Z"
            fill="#1e293b"
            className="drop-shadow-lg"
          />
          <circle cx="100" cy="100" r="8" fill="#1e293b" />
          <circle cx="100" cy="100" r="4" fill="#f8fafc" />
        </g>

        {/* Labels */}
        <text x="20" y="115" fontSize="10" fill="#94a3b8" textAnchor="middle">
          -50%
        </text>
        <text x="100" y="115" fontSize="10" fill="#94a3b8" textAnchor="middle">
          0%
        </text>
        <text x="180" y="115" fontSize="10" fill="#94a3b8" textAnchor="middle">
          +50%
        </text>
      </svg>

      {/* Center value display */}
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className={cn(
          'text-3xl font-bold tracking-tight',
          profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
        )}>
          {profit >= 0 ? '+' : ''}{profitMargin.toFixed(1)}%
        </div>
        <div className="text-sm text-slate-500 mt-1">Profit Margin</div>
      </div>

      {/* Revenue/Cost breakdown */}
      <div className="grid grid-cols-3 gap-4 mt-8 pt-4 border-t border-slate-100">
        <div className="text-center">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Revenue</div>
          <div className="text-lg font-semibold text-slate-700 mt-1">{formatCurrency(revenue)} kr</div>
        </div>
        <div className="text-center border-x border-slate-100">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Costs</div>
          <div className="text-lg font-semibold text-rose-600 mt-1">-{formatCurrency(costs)} kr</div>
        </div>
        <div className="text-center">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Profit</div>
          <div className={cn(
            'text-lg font-semibold mt-1',
            profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
          )}>
            {profit >= 0 ? '+' : ''}{formatCurrency(profit)} kr
          </div>
        </div>
      </div>
    </div>
  )
}

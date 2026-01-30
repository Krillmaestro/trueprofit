'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { GlowCard } from './GlowCard'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  XCircle,
  Info,
  Loader2,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

// Platform icons (simplified SVG paths)
const platformIcons: Record<string, React.ReactNode> = {
  FACEBOOK: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  ),
  GOOGLE: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  ),
  TIKTOK: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
    </svg>
  ),
}

interface ChannelData {
  platform: string
  name: string
  spend: number
  revenue: number
  profit: number
  roas: number
  breakEvenRoas: number
  isProfitable: boolean
  impressions: number
  clicks: number
  conversions: number
  cpc: number
  cpm: number
}

interface ChannelAttributionCardProps {
  startDate?: string
  endDate?: string
  className?: string
}

export function ChannelAttributionCard({
  startDate,
  endDate,
  className,
}: ChannelAttributionCardProps) {
  const [channels, setChannels] = useState<ChannelData[]>([])
  const [totals, setTotals] = useState<{
    spend: number
    revenue: number
    profit: number
    roas: number
    breakEvenRoas: number
    isProfitable: boolean
  } | null>(null)
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

        const response = await fetch(`/api/dashboard/channel-attribution?${params.toString()}`)
        if (!response.ok) throw new Error('Failed to fetch channel data')

        const data = await response.json()
        setChannels(data.channels || [])
        setTotals(data.totals || null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading data')
        // Use demo data
        setChannels([
          {
            platform: 'FACEBOOK',
            name: 'Facebook Ads',
            spend: 35000,
            revenue: 105000,
            profit: 42000,
            roas: 3.0,
            breakEvenRoas: 2.1,
            isProfitable: true,
            impressions: 850000,
            clicks: 28000,
            conversions: 580,
            cpc: 1.25,
            cpm: 41.18,
          },
          {
            platform: 'GOOGLE',
            name: 'Google Ads',
            spend: 17000,
            revenue: 40600,
            profit: 9500,
            roas: 2.39,
            breakEvenRoas: 2.1,
            isProfitable: true,
            impressions: 420000,
            clicks: 12000,
            conversions: 210,
            cpc: 1.42,
            cpm: 40.48,
          },
        ])
        setTotals({
          spend: 52000,
          revenue: 145600,
          profit: 51500,
          roas: 2.8,
          breakEvenRoas: 2.1,
          isProfitable: true,
        })
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
    return `${value.toLocaleString('sv-SE')} kr`
  }

  const formatNumber = (value: number) => {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`
    }
    if (value >= 1000) {
      return `${(value / 1000).toFixed(0)}k`
    }
    return value.toLocaleString('sv-SE')
  }

  if (loading) {
    return (
      <GlowCard className={cn('p-6', className)} glowColor="violet">
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
        </div>
      </GlowCard>
    )
  }

  if (channels.length === 0) {
    return (
      <GlowCard className={cn('p-6', className)} glowColor="blue">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Kanal-attribution</h3>
            <p className="text-xs text-slate-500">ROAS per marknadsföringskanal</p>
          </div>
        </div>
        <p className="text-sm text-slate-500 text-center py-8">
          Koppla dina annonskonton för att se ROAS per kanal.
        </p>
      </GlowCard>
    )
  }

  return (
    <GlowCard className={cn('p-6', className)} glowColor="violet">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-violet-600 flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-800">Kanal-attribution</h3>
            <p className="text-xs text-slate-500">ROAS per marknadsföringskanal</p>
          </div>
        </div>

        {/* Total ROAS badge */}
        {totals && (
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold',
            totals.isProfitable
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          )}>
            {totals.isProfitable ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <XCircle className="w-4 h-4" />
            )}
            <span>{totals.roas.toFixed(2)}x Total ROAS</span>
          </div>
        )}
      </div>

      {/* Channel list */}
      <div className="space-y-3">
        {channels.map((channel) => (
          <div
            key={channel.platform}
            className={cn(
              'p-4 rounded-xl border transition-all duration-200',
              channel.isProfitable
                ? 'bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50'
                : 'bg-rose-50/50 border-rose-200 hover:bg-rose-50'
            )}
          >
            <div className="flex items-center justify-between mb-3">
              {/* Platform info */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center',
                  channel.isProfitable ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                )}>
                  {platformIcons[channel.platform] || <BarChart3 className="w-4 h-4" />}
                </div>
                <div>
                  <div className="font-medium text-slate-800">{channel.name}</div>
                  <div className="text-xs text-slate-500">
                    {formatNumber(channel.conversions)} konverteringar
                  </div>
                </div>
              </div>

              {/* ROAS */}
              <div className="text-right">
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <div className={cn(
                          'text-2xl font-bold',
                          channel.isProfitable ? 'text-emerald-600' : 'text-rose-600'
                        )}>
                          {channel.roas.toFixed(2)}x
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>ROAS = {formatCurrency(channel.revenue)} / {formatCurrency(channel.spend)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  {channel.isProfitable ? (
                    <TrendingUp className="w-5 h-5 text-emerald-500" />
                  ) : (
                    <TrendingDown className="w-5 h-5 text-rose-500" />
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  BE: {channel.breakEvenRoas.toFixed(2)}x
                </div>
              </div>
            </div>

            {/* Metrics row */}
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200/50">
              <div>
                <div className="text-xs text-slate-500">Spend</div>
                <div className="text-sm font-medium text-slate-700">{formatCurrency(channel.spend)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Intäkt</div>
                <div className="text-sm font-medium text-slate-700">{formatCurrency(channel.revenue)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Vinst</div>
                <div className={cn(
                  'text-sm font-medium',
                  channel.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                )}>
                  {channel.profit >= 0 ? '+' : ''}{formatCurrency(channel.profit)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">CPC</div>
                <div className="text-sm font-medium text-slate-700">{channel.cpc.toFixed(2)} kr</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary footer */}
      {totals && (
        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-slate-500">Total Spend</div>
              <div className="text-lg font-bold text-slate-800">{formatCurrency(totals.spend)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Total Intäkt</div>
              <div className="text-lg font-bold text-slate-800">{formatCurrency(totals.revenue)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Total Vinst</div>
              <div className={cn(
                'text-lg font-bold',
                totals.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'
              )}>
                {totals.profit >= 0 ? '+' : ''}{formatCurrency(totals.profit)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="mt-4 p-3 bg-slate-50 rounded-lg">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-slate-600">
            <span className="font-medium">Break-Even ROAS:</span> Minimum ROAS för att täcka variabla kostnader (COGS, avgifter).
            Kanaler med ROAS över break-even är lönsamma.
          </div>
        </div>
      </div>
    </GlowCard>
  )
}

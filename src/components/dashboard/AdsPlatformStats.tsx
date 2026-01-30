'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { GlowCard } from './GlowCard'
import {
  TrendingUp,
  TrendingDown,
  Target,
  DollarSign,
  MousePointerClick,
  Eye,
  ShoppingCart,
  Loader2,
  CheckCircle2,
  XCircle,
} from 'lucide-react'

// Platform icons
const FacebookIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
)

const TikTokIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
)

interface PlatformData {
  platform: string
  name: string
  spend: number
  revenue: number
  roas: number
  breakEvenRoas: number
  isProfitable: boolean
  impressions: number
  clicks: number
  conversions: number
  cpc: number
  ctr: number
  conversionRate: number
}

interface AdsPlatformStatsProps {
  startDate?: string
  endDate?: string
  className?: string
}

export function AdsPlatformStats({
  startDate,
  endDate,
  className,
}: AdsPlatformStatsProps) {
  const [platforms, setPlatforms] = useState<PlatformData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams()
        if (startDate) params.set('startDate', startDate)
        if (endDate) params.set('endDate', endDate)

        const response = await fetch(`/api/dashboard/channel-attribution?${params.toString()}`)
        if (!response.ok) throw new Error('Failed to fetch')

        const data = await response.json()
        setPlatforms(data.channels || [])
      } catch {
        // Demo data
        setPlatforms([
          {
            platform: 'FACEBOOK',
            name: 'Facebook Ads',
            spend: 35000,
            revenue: 105000,
            roas: 3.0,
            breakEvenRoas: 2.1,
            isProfitable: true,
            impressions: 850000,
            clicks: 28000,
            conversions: 580,
            cpc: 1.25,
            ctr: 3.29,
            conversionRate: 2.07,
          },
          {
            platform: 'GOOGLE',
            name: 'Google Ads',
            spend: 17000,
            revenue: 40600,
            roas: 2.39,
            breakEvenRoas: 2.1,
            isProfitable: true,
            impressions: 420000,
            clicks: 12000,
            conversions: 210,
            cpc: 1.42,
            ctr: 2.86,
            conversionRate: 1.75,
          },
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
      return `${(value / 1000).toFixed(1)}k kr`
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

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'FACEBOOK':
        return <FacebookIcon />
      case 'GOOGLE':
        return <GoogleIcon />
      case 'TIKTOK':
        return <TikTokIcon />
      default:
        return <Target className="w-5 h-5" />
    }
  }

  const getPlatformColor = (platform: string) => {
    switch (platform) {
      case 'FACEBOOK':
        return { bg: 'from-blue-500 to-blue-600', text: 'text-blue-600', light: 'bg-blue-50' }
      case 'GOOGLE':
        return { bg: 'from-red-500 to-yellow-500', text: 'text-red-600', light: 'bg-red-50' }
      case 'TIKTOK':
        return { bg: 'from-gray-900 to-gray-700', text: 'text-gray-800', light: 'bg-gray-100' }
      default:
        return { bg: 'from-violet-500 to-violet-600', text: 'text-violet-600', light: 'bg-violet-50' }
    }
  }

  if (loading) {
    return (
      <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-4', className)}>
        {[1, 2].map((i) => (
          <GlowCard key={i} className="p-6" glowColor="blue">
            <div className="flex items-center justify-center h-48">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          </GlowCard>
        ))}
      </div>
    )
  }

  if (platforms.length === 0) {
    return (
      <GlowCard className={cn('p-6', className)} glowColor="blue">
        <div className="text-center py-8">
          <Target className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="font-semibold text-slate-700 mb-1">Inga annonsplattformar kopplade</h3>
          <p className="text-sm text-slate-500">
            Koppla Facebook Ads eller Google Ads för att se detaljerad statistik.
          </p>
        </div>
      </GlowCard>
    )
  }

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-4', className)}>
      {platforms.map((platform) => {
        const colors = getPlatformColor(platform.platform)
        const profit = platform.revenue - platform.spend - (platform.revenue * 0.4) // Estimate variable costs

        return (
          <GlowCard
            key={platform.platform}
            className="p-5"
            glowColor={platform.isProfitable ? 'emerald' : 'rose'}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-white',
                  colors.bg
                )}>
                  {getPlatformIcon(platform.platform)}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">{platform.name}</h3>
                  <p className="text-xs text-slate-500">Annonsstatistik</p>
                </div>
              </div>

              {/* Status badge */}
              <div className={cn(
                'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold',
                platform.isProfitable
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              )}>
                {platform.isProfitable ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                {platform.isProfitable ? 'Lönsam' : 'Förlust'}
              </div>
            </div>

            {/* ROAS - Main metric */}
            <div className="bg-slate-50 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 mb-1">ROAS</div>
                  <div className={cn(
                    'text-3xl font-bold',
                    platform.isProfitable ? 'text-emerald-600' : 'text-rose-600'
                  )}>
                    {platform.roas.toFixed(2)}x
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 mb-1">Break-Even</div>
                  <div className="text-xl font-semibold text-slate-600">
                    {platform.breakEvenRoas.toFixed(2)}x
                  </div>
                </div>
              </div>

              {/* Visual indicator */}
              <div className="mt-3 flex items-center gap-2">
                {platform.isProfitable ? (
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-rose-500" />
                )}
                <span className={cn(
                  'text-sm font-medium',
                  platform.isProfitable ? 'text-emerald-600' : 'text-rose-600'
                )}>
                  {platform.isProfitable ? '+' : ''}
                  {((platform.roas - platform.breakEvenRoas) / platform.breakEvenRoas * 100).toFixed(0)}%
                  {platform.isProfitable ? ' över' : ' under'} break-even
                </span>
              </div>
            </div>

            {/* Key metrics grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span className="text-xs">Spend</span>
                </div>
                <div className="font-bold text-slate-800">{formatCurrency(platform.spend)}</div>
              </div>

              <div className="bg-slate-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span className="text-xs">Intäkt</span>
                </div>
                <div className="font-bold text-slate-800">{formatCurrency(platform.revenue)}</div>
              </div>
            </div>

            {/* Performance metrics */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-50/50 rounded-lg p-2">
                <div className="flex items-center justify-center gap-1 text-slate-400 mb-0.5">
                  <Eye className="w-3 h-3" />
                </div>
                <div className="text-sm font-semibold text-slate-700">{formatNumber(platform.impressions)}</div>
                <div className="text-[10px] text-slate-400">Visningar</div>
              </div>

              <div className="bg-slate-50/50 rounded-lg p-2">
                <div className="flex items-center justify-center gap-1 text-slate-400 mb-0.5">
                  <MousePointerClick className="w-3 h-3" />
                </div>
                <div className="text-sm font-semibold text-slate-700">{formatNumber(platform.clicks)}</div>
                <div className="text-[10px] text-slate-400">Klick</div>
              </div>

              <div className="bg-slate-50/50 rounded-lg p-2">
                <div className="flex items-center justify-center gap-1 text-slate-400 mb-0.5">
                  <ShoppingCart className="w-3 h-3" />
                </div>
                <div className="text-sm font-semibold text-slate-700">{formatNumber(platform.conversions)}</div>
                <div className="text-[10px] text-slate-400">Köp</div>
              </div>
            </div>

            {/* CPC and CTR */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
              <span>CPC: <span className="font-medium text-slate-700">{platform.cpc.toFixed(2)} kr</span></span>
              <span>CTR: <span className="font-medium text-slate-700">{platform.ctr.toFixed(2)}%</span></span>
              <span>Conv: <span className="font-medium text-slate-700">{platform.conversionRate.toFixed(2)}%</span></span>
            </div>
          </GlowCard>
        )
      })}
    </div>
  )
}

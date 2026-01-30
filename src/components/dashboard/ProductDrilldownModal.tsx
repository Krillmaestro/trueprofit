'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import {
  X,
  TrendingUp,
  TrendingDown,
  Package,
  ShoppingCart,
  DollarSign,
  Percent,
  RefreshCcw,
  BarChart3,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ProductDetails {
  id: string
  name: string
  sku: string
  revenue: number
  profit: number
  margin: number
  orders: number
  quantity: number
  avgPrice: number
  cogs: number
  refunds: number
  refundRate: number
  variants: Array<{
    name: string
    sku: string
    revenue: number
    profit: number
    orders: number
  }>
  dailyData: Array<{
    date: string
    revenue: number
    profit: number
    orders: number
  }>
  channelBreakdown: Array<{
    channel: string
    orders: number
    revenue: number
    percentage: number
  }>
}

interface ProductDrilldownModalProps {
  productId: string | null
  productName: string
  isOpen: boolean
  onClose: () => void
  startDate?: string
  endDate?: string
}

export function ProductDrilldownModal({
  productId,
  productName,
  isOpen,
  onClose,
  startDate,
  endDate,
}: ProductDrilldownModalProps) {
  const [details, setDetails] = useState<ProductDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !productId) {
      setDetails(null)
      return
    }

    const fetchDetails = async () => {
      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams()
        params.set('productId', productId)
        if (startDate) params.set('startDate', startDate)
        if (endDate) params.set('endDate', endDate)

        const response = await fetch(`/api/dashboard/product-details?${params.toString()}`)
        if (!response.ok) throw new Error('Failed to fetch product details')

        const data = await response.json()
        setDetails(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading data')
        // Use demo data
        setDetails({
          id: productId,
          name: productName,
          sku: 'DEMO-SKU-001',
          revenue: 89400,
          profit: 42500,
          margin: 47.5,
          orders: 156,
          quantity: 198,
          avgPrice: 574,
          cogs: 28500,
          refunds: 2800,
          refundRate: 3.1,
          variants: [
            { name: 'Size S', sku: 'S', revenue: 18200, profit: 8650, orders: 32 },
            { name: 'Size M', sku: 'M', revenue: 35600, profit: 16920, orders: 62 },
            { name: 'Size L', sku: 'L', revenue: 28400, profit: 13490, orders: 49 },
            { name: 'Size XL', sku: 'XL', revenue: 7200, profit: 3440, orders: 13 },
          ],
          dailyData: [
            { date: '2025-01-22', revenue: 3200, profit: 1520, orders: 6 },
            { date: '2025-01-23', revenue: 4100, profit: 1950, orders: 7 },
            { date: '2025-01-24', revenue: 2800, profit: 1330, orders: 5 },
            { date: '2025-01-25', revenue: 5600, profit: 2660, orders: 10 },
            { date: '2025-01-26', revenue: 4500, profit: 2140, orders: 8 },
            { date: '2025-01-27', revenue: 6200, profit: 2950, orders: 11 },
            { date: '2025-01-28', revenue: 5100, profit: 2430, orders: 9 },
          ],
          channelBreakdown: [
            { channel: 'Facebook Ads', orders: 78, revenue: 44800, percentage: 50 },
            { channel: 'Google Ads', orders: 47, revenue: 27000, percentage: 30 },
            { channel: 'Organic', orders: 31, revenue: 17600, percentage: 20 },
          ],
        })
      } finally {
        setLoading(false)
      }
    }

    fetchDetails()
  }, [isOpen, productId, productName, startDate, endDate])

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M kr`
    }
    if (Math.abs(value) >= 1000) {
      return `${(value / 1000).toFixed(1)}k kr`
    }
    return `${value.toLocaleString('sv-SE')} kr`
  }

  const formatNumber = (value: number) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`
    }
    return value.toLocaleString('sv-SE')
  }

  // Calculate trend from daily data
  const getTrend = () => {
    if (!details?.dailyData || details.dailyData.length < 2) return null
    const recent = details.dailyData.slice(-3).reduce((sum, d) => sum + d.revenue, 0)
    const earlier = details.dailyData.slice(0, 3).reduce((sum, d) => sum + d.revenue, 0)
    if (earlier === 0) return null
    return ((recent - earlier) / earlier) * 100
  }

  const trend = getTrend()

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
              <Package className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-800">{productName}</div>
              {details && (
                <div className="text-sm font-normal text-slate-500">{details.sku}</div>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : !details ? (
          <div className="text-center py-16 text-slate-500">
            Kunde inte ladda produktdata
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                  <DollarSign className="w-4 h-4" />
                  Intäkt
                </div>
                <div className="text-2xl font-bold text-slate-800">
                  {formatCurrency(details.revenue)}
                </div>
                {trend !== null && (
                  <div className={cn(
                    'flex items-center gap-1 text-xs mt-1',
                    trend >= 0 ? 'text-emerald-600' : 'text-rose-600'
                  )}>
                    {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {Math.abs(trend).toFixed(1)}% trend
                  </div>
                )}
              </div>

              <div className="bg-emerald-50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-emerald-600 text-sm mb-1">
                  <TrendingUp className="w-4 h-4" />
                  Vinst
                </div>
                <div className="text-2xl font-bold text-emerald-700">
                  {formatCurrency(details.profit)}
                </div>
                <div className="text-xs text-emerald-600 mt-1">
                  COGS: {formatCurrency(details.cogs)}
                </div>
              </div>

              <div className="bg-violet-50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-violet-600 text-sm mb-1">
                  <Percent className="w-4 h-4" />
                  Marginal
                </div>
                <div className="text-2xl font-bold text-violet-700">
                  {details.margin.toFixed(1)}%
                </div>
                <div className="text-xs text-violet-600 mt-1">
                  Snitt: {formatCurrency(details.avgPrice)}/st
                </div>
              </div>

              <div className="bg-amber-50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-amber-600 text-sm mb-1">
                  <ShoppingCart className="w-4 h-4" />
                  Orders
                </div>
                <div className="text-2xl font-bold text-amber-700">
                  {formatNumber(details.orders)}
                </div>
                <div className="text-xs text-amber-600 mt-1">
                  {formatNumber(details.quantity)} enheter sålda
                </div>
              </div>
            </div>

            {/* Refund Rate Warning */}
            {details.refundRate > 5 && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3">
                <RefreshCcw className="w-5 h-5 text-rose-600 mt-0.5" />
                <div>
                  <div className="font-medium text-rose-800">Hög returfrekvens</div>
                  <div className="text-sm text-rose-700">
                    {details.refundRate.toFixed(1)}% av köpen har returnerats ({formatCurrency(details.refunds)} i returer)
                  </div>
                </div>
              </div>
            )}

            {/* Variants Table */}
            {details.variants.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Varianter
                </h3>
                <div className="bg-slate-50 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="text-left text-xs font-medium text-slate-500 px-4 py-3">Variant</th>
                        <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">Orders</th>
                        <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">Intäkt</th>
                        <th className="text-right text-xs font-medium text-slate-500 px-4 py-3">Vinst</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.variants.map((variant, index) => (
                        <tr key={variant.sku} className={cn(
                          index !== details.variants.length - 1 && 'border-b border-slate-200'
                        )}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-700">{variant.name}</div>
                            <div className="text-xs text-slate-400">{variant.sku}</div>
                          </td>
                          <td className="text-right px-4 py-3 text-slate-600">
                            {variant.orders}
                          </td>
                          <td className="text-right px-4 py-3 text-slate-700 font-medium">
                            {formatCurrency(variant.revenue)}
                          </td>
                          <td className="text-right px-4 py-3 text-emerald-600 font-medium">
                            {formatCurrency(variant.profit)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Daily Trend Mini Chart */}
            {details.dailyData.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Daglig trend (senaste 7 dagarna)
                </h3>
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-end gap-2 h-24">
                    {details.dailyData.map((day, index) => {
                      const maxRevenue = Math.max(...details.dailyData.map(d => d.revenue))
                      const height = maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0
                      return (
                        <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                          <div
                            className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-md transition-all hover:from-blue-600 hover:to-blue-500"
                            style={{ height: `${height}%`, minHeight: '4px' }}
                            title={`${day.date}: ${formatCurrency(day.revenue)}`}
                          />
                          <span className="text-[10px] text-slate-400">
                            {new Date(day.date).toLocaleDateString('sv-SE', { weekday: 'short' })}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Channel Breakdown */}
            {details.channelBreakdown.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Kanalfördelning
                </h3>
                <div className="space-y-3">
                  {details.channelBreakdown.map((channel) => (
                    <div key={channel.channel} className="bg-slate-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-slate-700">{channel.channel}</div>
                        <div className="text-sm text-slate-500">
                          {channel.orders} orders • {formatCurrency(channel.revenue)}
                        </div>
                      </div>
                      <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                          style={{ width: `${channel.percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {channel.percentage}% av försäljningen
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Return Info */}
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-600">
                  <RefreshCcw className="w-4 h-4" />
                  <span className="text-sm">Returer</span>
                </div>
                <div className="text-right">
                  <div className="font-medium text-slate-700">{formatCurrency(details.refunds)}</div>
                  <div className={cn(
                    'text-xs',
                    details.refundRate > 5 ? 'text-rose-600' : 'text-slate-500'
                  )}>
                    {details.refundRate.toFixed(1)}% returfrekvens
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

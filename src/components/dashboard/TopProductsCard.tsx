'use client'

import { cn } from '@/lib/utils'
import { GlowCard } from './GlowCard'
import { TrendingUp, TrendingDown, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface Product {
  id: string
  name: string
  sku: string
  revenue: number
  profit: number
  margin: number
  orders: number
  trend: 'up' | 'down' | 'stable'
}

interface TopProductsCardProps {
  products: Product[]
  loading?: boolean
}

export function TopProductsCard({ products, loading }: TopProductsCardProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`
    }
    return value.toFixed(0)
  }

  if (loading) {
    return (
      <GlowCard className="p-6" hover={false}>
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-40 mb-6" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-200 rounded-xl" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 rounded w-32 mb-2" />
                  <div className="h-3 bg-slate-200 rounded w-20" />
                </div>
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
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Top Products</h2>
          <p className="text-sm text-slate-500 mt-0.5">By profit this period</p>
        </div>
        <Link
          href="/products"
          className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          View all
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="space-y-3">
        {products.slice(0, 5).map((product, index) => (
          <div
            key={product.id}
            className={cn(
              'flex items-center gap-4 p-3 rounded-xl transition-colors',
              'hover:bg-slate-50/80 group cursor-pointer'
            )}
          >
            {/* Rank */}
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold',
                index === 0 && 'bg-amber-100 text-amber-700',
                index === 1 && 'bg-slate-200 text-slate-600',
                index === 2 && 'bg-orange-100 text-orange-700',
                index > 2 && 'bg-slate-100 text-slate-500'
              )}
            >
              {index + 1}
            </div>

            {/* Product info */}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                {product.name}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-400">{product.sku}</span>
                <span className="text-xs text-slate-300">•</span>
                <span className="text-xs text-slate-500">{product.orders} orders</span>
              </div>
            </div>

            {/* Margin badge */}
            <div
              className={cn(
                'px-2 py-1 rounded-md text-xs font-medium',
                product.margin >= 50
                  ? 'bg-emerald-50 text-emerald-700'
                  : product.margin >= 30
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-rose-50 text-rose-700'
              )}
            >
              {product.margin.toFixed(0)}%
            </div>

            {/* Trend & profit */}
            <div className="text-right">
              <div className="flex items-center justify-end gap-1">
                {product.trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />}
                {product.trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-rose-500" />}
                <span className="font-semibold text-slate-800">{formatCurrency(product.profit)} kr</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {formatCurrency(product.revenue)} kr rev
              </div>
            </div>
          </div>
        ))}
      </div>

      {products.length === 0 && (
        <div className="text-center py-8">
          <div className="text-slate-400 text-sm">No product data yet</div>
          <Link href="/cogs" className="text-blue-600 text-sm font-medium hover:underline mt-1 inline-block">
            Set up COGS to track profits
          </Link>
        </div>
      )}
    </GlowCard>
  )
}

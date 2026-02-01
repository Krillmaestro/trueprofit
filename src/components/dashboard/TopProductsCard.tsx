'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { GlowCard } from './GlowCard'
import { ProductDrilldownModal } from './ProductDrilldownModal'
import { TrendingUp, TrendingDown, ExternalLink, ChevronRight } from 'lucide-react'
import Link from 'next/link'

interface Product {
  id: string
  name: string
  sku: string
  revenue: number
  profit: number
  margin: number | null  // null when COGS is missing
  orders: number
  trend: 'up' | 'down' | 'stable'
  hasCogs?: boolean
}

interface TopProductsCardProps {
  products: Product[]
  loading?: boolean
  startDate?: string
  endDate?: string
}

export function TopProductsCard({ products, loading, startDate, endDate }: TopProductsCardProps) {
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string } | null>(null)

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`
    }
    return value.toFixed(0)
  }

  const handleProductClick = (product: Product) => {
    setSelectedProduct({ id: product.id, name: product.name })
  }

  if (loading) {
    return (
      <GlowCard className="p-6" hover={false}>
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-40 mb-6" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 rounded-xl" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32 mb-2" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20" />
                </div>
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-16" />
              </div>
            ))}
          </div>
        </div>
      </GlowCard>
    )
  }

  return (
    <>
      <GlowCard className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Topprodukter</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Efter vinst denna period</p>
          </div>
          <Link
            href="/products"
            className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            Visa alla
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-2">
          {products.slice(0, 5).map((product, index) => (
            <div
              key={product.id}
              onClick={() => handleProductClick(product)}
              className={cn(
                'flex items-center gap-4 p-3 rounded-xl transition-all duration-200',
                'hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:shadow-sm group cursor-pointer',
                'border border-transparent hover:border-blue-100 dark:hover:border-blue-800'
              )}
            >
              {/* Rank */}
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors',
                  index === 0 && 'bg-amber-100 text-amber-700 group-hover:bg-amber-200 dark:bg-amber-900/50 dark:text-amber-300 dark:group-hover:bg-amber-900/70',
                  index === 1 && 'bg-slate-200 text-slate-600 group-hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:group-hover:bg-slate-600',
                  index === 2 && 'bg-orange-100 text-orange-700 group-hover:bg-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:group-hover:bg-orange-900/70',
                  index > 2 && 'bg-slate-100 text-slate-500 group-hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-slate-700'
                )}
              >
                {index + 1}
              </div>

              {/* Product info */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-800 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {product.name}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-slate-400 dark:text-slate-500">{product.sku}</span>
                  <span className="text-xs text-slate-300 dark:text-slate-600">•</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{product.orders} orders</span>
                </div>
              </div>

              {/* Margin badge */}
              <div
                className={cn(
                  'px-2 py-1 rounded-md text-xs font-medium',
                  product.margin === null
                    ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'  // No COGS data
                    : product.margin >= 50
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                    : product.margin >= 30
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                )}
                title={product.margin === null ? 'COGS saknas - lägg till för exakt marginal' : `${product.margin.toFixed(1)}% vinstmarginal`}
              >
                {product.margin !== null ? `${product.margin.toFixed(0)}%` : 'N/A'}
              </div>

              {/* Trend & profit */}
              <div className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {product.trend === 'up' && <TrendingUp className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />}
                  {product.trend === 'down' && <TrendingDown className="w-3.5 h-3.5 text-rose-500 dark:text-rose-400" />}
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{formatCurrency(product.profit)} kr</span>
                </div>
                <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                  {formatCurrency(product.revenue)} kr rev
                </div>
              </div>

              {/* Arrow indicator */}
              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
            </div>
          ))}
        </div>

        {products.length === 0 && (
          <div className="text-center py-8">
            <div className="text-slate-400 dark:text-slate-500 text-sm">Ingen produktdata ännu</div>
            <Link href="/cogs" className="text-blue-600 dark:text-blue-400 text-sm font-medium hover:underline mt-1 inline-block">
              Sätt upp COGS för att spåra vinster
            </Link>
          </div>
        )}

        {/* Click hint */}
        {products.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
              Klicka på en produkt för att se detaljerad analys
            </p>
          </div>
        )}
      </GlowCard>

      {/* Product Drilldown Modal */}
      <ProductDrilldownModal
        productId={selectedProduct?.id || null}
        productName={selectedProduct?.name || ''}
        isOpen={!!selectedProduct}
        onClose={() => setSelectedProduct(null)}
        startDate={startDate}
        endDate={endDate}
      />
    </>
  )
}

'use client'

import { useState, useEffect, useCallback } from 'react'
import { StatCard } from '@/components/dashboard/StatCard'
import { RevenueFlowChart } from '@/components/dashboard/RevenueFlowChart'
import { CostWaterfallChart } from '@/components/dashboard/CostWaterfallChart'
import { TopProductsCard } from '@/components/dashboard/TopProductsCard'
import { ProfitMeter } from '@/components/dashboard/ProfitMeter'
import { DateRangePicker, getDefaultDateRange } from '@/components/dashboard/DateRangePicker'
import { SyncButton } from '@/components/dashboard/SyncButton'
import { GlowCard } from '@/components/dashboard/GlowCard'
import { ComparisonToggle, ComparisonSummary, getPreviousPeriod } from '@/components/dashboard/ComparisonToggle'
import { BreakEvenCard } from '@/components/dashboard/BreakEvenCard'
import { BreakEvenRoasCard } from '@/components/dashboard/BreakEvenRoasCard'
import { BenchmarkCard } from '@/components/dashboard/BenchmarkCard'
import { NetProfitHeroCard } from '@/components/dashboard/NetProfitHeroCard'
import { ProfitPieChart } from '@/components/dashboard/ProfitPieChart'
import { AdsPlatformStats } from '@/components/dashboard/AdsPlatformStats'
import { CustomerMetricsCard } from '@/components/dashboard/CustomerMetricsCard'
import { NoDataState } from '@/components/dashboard/NoDataState'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  DollarSign,
  ShoppingCart,
  Package,
  Percent,
  Wallet,
  Target,
  AlertTriangle,
  Receipt,
  Loader2,
} from 'lucide-react'

interface DashboardData {
  summary: {
    revenue: number
    revenueExVat?: number
    netRevenue?: number
    tax?: number
    costs: number
    profit: number
    margin: number
    grossMargin: number
    orders: number
    avgOrderValue: number
  }
  breakdown: {
    revenue: {
      gross: number
      discounts: number
      refunds: number
      shipping: number
      tax: number
      exVat?: number
      net: number
    }
    costs: {
      vat?: number
      cogs: number
      shipping: number
      shippingCost?: number
      fees: number
      adSpend: number
      fixed: number
      variable: number
      salaries: number
      recurring: number
      oneTime: number
      total: number
      totalWithVat?: number
    }
    profit: {
      gross: number
      operating: number
      net: number
    }
  }
  chartData: {
    daily: Array<{
      date: string
      revenue: number
      shipping: number
      tax: number
      discounts: number
      refunds: number
      orders: number
    }>
    costBreakdown: Array<{
      name: string
      value: number
      color: string
    }>
  }
  ads: {
    spend: number
    revenue: number
    roas: number
    breakEvenRoas?: number
    isAdsProfitable?: boolean
    impressions: number
    clicks: number
    conversions: number
    hasData?: boolean
  }
  dataQuality: {
    totalLineItems: number
    unmatchedLineItems: number
    cogsCompleteness: number
    cogsWarning?: string | null
    adsWarning?: string | null
  }
}

interface TopProduct {
  id: string
  name: string
  sku: string
  revenue: number
  profit: number
  margin: number
  orders: number
  trend: 'up' | 'down' | 'stable'
}

// Generate trend data for sparklines
const generateTrendData = (base: number, variance: number, length: number) => {
  const data = []
  let current = base
  for (let i = 0; i < length; i++) {
    current = current + (Math.random() - 0.45) * variance
    data.push(Math.max(0, current))
  }
  return data
}

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState(getDefaultDateRange())
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [comparisonEnabled, setComparisonEnabled] = useState(false)
  const [previousData, setPreviousData] = useState<DashboardData | null>(null)
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [topProductsLoading, setTopProductsLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [hasStore, setHasStore] = useState(true)

  const fetchDashboardData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (dateRange.startDate) {
        params.set('startDate', dateRange.startDate.toISOString())
      }
      if (dateRange.endDate) {
        params.set('endDate', dateRange.endDate.toISOString())
      }

      const response = await fetch(`/api/dashboard/summary?${params.toString()}`)

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data')
      }

      const result = await response.json()
      setData(result)

      // Check if store exists
      if (result.summary.orders === 0) {
        // Check if we have a store connected
        const storeRes = await fetch('/api/stores')
        if (storeRes.ok) {
          const storeData = await storeRes.json()
          setHasStore(storeData.stores && storeData.stores.length > 0)
        }
      } else {
        setHasStore(true)
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setError('Kunde inte ladda data. Försök igen.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [dateRange])

  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  // Fetch top products
  useEffect(() => {
    const fetchTopProducts = async () => {
      if (!data || data.summary.orders === 0) {
        setTopProducts([])
        setTopProductsLoading(false)
        return
      }

      setTopProductsLoading(true)
      try {
        const params = new URLSearchParams()
        if (dateRange.startDate) {
          params.set('startDate', dateRange.startDate.toISOString())
        }
        if (dateRange.endDate) {
          params.set('endDate', dateRange.endDate.toISOString())
        }

        const response = await fetch(`/api/dashboard/top-products?${params.toString()}`)
        if (response.ok) {
          const result = await response.json()
          setTopProducts(result.products || [])
        } else {
          setTopProducts([])
        }
      } catch {
        setTopProducts([])
      } finally {
        setTopProductsLoading(false)
      }
    }

    fetchTopProducts()
  }, [dateRange, data])

  // Fetch comparison period data when enabled
  useEffect(() => {
    if (!comparisonEnabled || !data) {
      setPreviousData(null)
      return
    }

    const fetchPreviousPeriod = async () => {
      const previous = getPreviousPeriod(dateRange)
      try {
        const params = new URLSearchParams()
        params.set('startDate', previous.startDate.toISOString())
        params.set('endDate', previous.endDate.toISOString())

        const response = await fetch(`/api/dashboard/summary?${params.toString()}`)
        if (response.ok) {
          const result = await response.json()
          setPreviousData(result)
        }
      } catch {
        setPreviousData(null)
      }
    }

    fetchPreviousPeriod()
  }, [comparisonEnabled, dateRange, data])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/sync/all', { method: 'POST' })
      await fetchDashboardData()
    } finally {
      setSyncing(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-slate-500">Laddar dashboard...</p>
        </div>
      </div>
    )
  }

  // No data state
  if (!data || data.summary.orders === 0) {
    return (
      <div className="space-y-6 pb-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Vinstöversikt</h1>
            <p className="text-slate-500 mt-1">
              Spåra din butiks prestation i realtid
            </p>
          </div>
          <div className="flex items-center gap-2">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        <NoDataState
          hasStore={hasStore}
          onSync={handleSync}
          syncing={syncing}
          dateRange={dateRange}
        />
      </div>
    )
  }

  const previousPeriod = getPreviousPeriod(dateRange)

  // Generate trend data for sparklines
  const revenueTrend = generateTrendData(data.summary.revenue, data.summary.revenue * 0.05, 14)
  const ordersTrend = generateTrendData(data.summary.orders, data.summary.orders * 0.1, 14)
  const marginTrend = generateTrendData(data.summary.margin, 5, 14)

  // Transform daily data for charts
  const profitChartData = data.chartData.daily.map(day => ({
    date: new Date(day.date).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' }),
    revenue: day.revenue,
    costs: day.revenue * (data.breakdown.costs.total / data.summary.revenue) || 0,
    profit: day.revenue - (day.revenue * (data.breakdown.costs.total / data.summary.revenue) || 0),
  }))

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Vinstöversikt</h1>
          <p className="text-slate-500 mt-1">
            Spåra din butiks prestation i realtid
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncButton
            onSyncComplete={fetchDashboardData}
            dateFrom={dateRange.startDate.toISOString().split('T')[0]}
            dateTo={dateRange.endDate.toISOString().split('T')[0]}
          />
          <ComparisonToggle enabled={comparisonEnabled} onToggle={setComparisonEnabled} />
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert className="bg-rose-50 border-rose-200">
          <AlertTriangle className="h-4 w-4 text-rose-600" />
          <AlertDescription className="text-rose-800">{error}</AlertDescription>
        </Alert>
      )}

      {/* Comparison Summary */}
      {comparisonEnabled && previousData && (
        <ComparisonSummary
          currentPeriod={dateRange}
          previousPeriod={previousPeriod}
          metrics={{
            revenue: { current: data.summary.revenue, previous: previousData.summary.revenue },
            profit: { current: data.summary.profit, previous: previousData.summary.profit },
            orders: { current: data.summary.orders, previous: previousData.summary.orders },
            margin: { current: data.summary.margin, previous: previousData.summary.margin },
          }}
          loading={loading}
        />
      )}

      {/* Data Quality Warnings */}
      {data.dataQuality.cogsCompleteness < 80 && (
        <Alert className="bg-blue-50 border-blue-200">
          <AlertTriangle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            Endast {data.dataQuality.cogsCompleteness.toFixed(0)}% av dina produkter har COGS.
            Lägg till COGS-data för mer exakta vinstberäkningar.
          </AlertDescription>
        </Alert>
      )}

      {/* Ads Data Warning */}
      {data.dataQuality.adsWarning && (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            {data.dataQuality.adsWarning}
          </AlertDescription>
        </Alert>
      )}

      {/* HERO SECTION - Net Profit + Break-Even ROAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Net Profit Hero - Uses revenueExVat for correct math */}
        <NetProfitHeroCard
          revenue={data.summary.revenueExVat || data.breakdown.revenue.exVat || (data.summary.revenue - (data.summary.tax || 0))}
          costs={data.breakdown.costs.total}
          profit={data.summary.profit}
          margin={data.summary.margin}
          orders={data.summary.orders}
          adSpend={data.ads.spend}
          previousProfit={comparisonEnabled && previousData ? previousData.summary.profit : undefined}
          loading={loading}
        />

        {/* Break-Even ROAS Hero */}
        <BreakEvenRoasCard
          adSpend={data.ads.spend}
          adRevenue={data.ads.revenue}
          breakEvenRoas={data.ads.breakEvenRoas || 2.0}
        />
      </div>

      {/* Primary KPIs - 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Omsättning"
          value={data.summary.revenue}
          suffix=" kr"
          icon={DollarSign}
          iconBgColor="bg-blue-50"
          iconColor="text-blue-600"
          trend={revenueTrend}
          loading={loading}
        />
        <StatCard
          title="Totala kostnader"
          value={data.breakdown.costs.total}
          suffix=" kr"
          icon={Wallet}
          iconBgColor="bg-rose-50"
          iconColor="text-rose-600"
          loading={loading}
        />
        <StatCard
          title="Vinstmarginal"
          value={data.summary.margin}
          suffix="%"
          icon={Percent}
          iconBgColor="bg-violet-50"
          iconColor="text-violet-600"
          trend={marginTrend}
          loading={loading}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Orders"
          value={data.summary.orders}
          icon={ShoppingCart}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
          trend={ordersTrend}
          loading={loading}
          compact
        />
        <StatCard
          title="Avg Order Value"
          value={data.summary.avgOrderValue}
          suffix=" kr"
          icon={Package}
          iconBgColor="bg-cyan-50"
          iconColor="text-cyan-600"
          loading={loading}
          compact
        />
        <StatCard
          title="Moms (VAT)"
          value={data.summary.tax || data.breakdown.revenue.tax || 0}
          suffix=" kr"
          icon={Receipt}
          iconBgColor="bg-red-50"
          iconColor="text-red-600"
          loading={loading}
          compact
        />
        <StatCard
          title="Ad Spend"
          value={data.ads.spend}
          suffix=" kr"
          icon={Target}
          iconBgColor="bg-rose-50"
          iconColor="text-rose-600"
          loading={loading}
          compact
        />
        <StatCard
          title="ROAS"
          value={data.ads.roas}
          suffix="x"
          icon={Wallet}
          iconBgColor="bg-indigo-50"
          iconColor="text-indigo-600"
          loading={loading}
          compact
          decimals={2}
        />
      </div>

      {/* Charts Row - Revenue Flow + Pie Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <RevenueFlowChart data={profitChartData} loading={loading} />
        <ProfitPieChart
          revenue={data.summary.revenue}  // Full revenue inkl VAT
          costs={{
            vat: data.summary.tax || data.breakdown.revenue.tax || 0,  // VAT är en kostnad!
            cogs: data.breakdown.costs.cogs,
            shipping: data.breakdown.costs.shippingCost || data.breakdown.costs.shipping,
            fees: data.breakdown.costs.fees,
            adSpend: data.breakdown.costs.adSpend,
            fixed: data.breakdown.costs.fixed,
            salaries: data.breakdown.costs.salaries,
            variable: data.breakdown.costs.variable,
            oneTime: data.breakdown.costs.oneTime,
          }}
          profit={data.summary.profit}
        />
      </div>

      {/* Ads Platform Stats */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Annonsplattformar</h2>
        <AdsPlatformStats
          startDate={dateRange.startDate.toISOString()}
          endDate={dateRange.endDate.toISOString()}
        />
      </div>

      {/* Cost Breakdown + Top Products */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <CostWaterfallChart
          data={data.chartData.costBreakdown}
          total={data.breakdown.costs.total}
          loading={loading}
        />
        <TopProductsCard
          products={topProducts}
          loading={topProductsLoading}
          startDate={dateRange.startDate.toISOString()}
          endDate={dateRange.endDate.toISOString()}
        />
      </div>

      {/* Analytics Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BreakEvenCard
          revenue={data.summary.revenue}
          profit={data.summary.profit}
          costs={{
            vat: data.summary.tax || data.breakdown.revenue.tax || 0,  // VAT är en kostnad!
            cogs: data.breakdown.costs.cogs,
            fees: data.breakdown.costs.fees,
            shippingCost: data.breakdown.costs.shippingCost || data.breakdown.costs.shipping,
            adSpend: data.breakdown.costs.adSpend,
            fixed: data.breakdown.costs.fixed,
            salaries: data.breakdown.costs.salaries,
            variable: data.breakdown.costs.variable,
            oneTime: data.breakdown.costs.oneTime,
          }}
          avgOrderValue={data.summary.avgOrderValue}
          avgMargin={data.summary.margin}
          daysInPeriod={Math.ceil((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1}
          daysElapsed={Math.ceil((new Date().getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24))}
        />
        <BenchmarkCard
          industry="general"
          margin={data.summary.margin}
          cogsPercent={data.summary.revenue > 0 ? (data.breakdown.costs.cogs / data.summary.revenue) * 100 : 0}
          shippingPercent={data.breakdown.revenue?.shipping && data.summary.revenue > 0 ? (data.breakdown.revenue.shipping / data.summary.revenue) * 100 : 0}
        />
      </div>

      {/* Customer Metrics + Profit Health */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <CustomerMetricsCard
          startDate={dateRange.startDate.toISOString()}
          endDate={dateRange.endDate.toISOString()}
        />
        <GlowCard className="p-6" glowColor="emerald">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Vinsthälsa</h2>
          <p className="text-sm text-slate-500 mb-4">Din nuvarande lönsamhet i en överblick</p>
          <ProfitMeter
            revenue={data.summary.revenue}
            costs={data.breakdown.costs.total}
            profit={data.summary.profit}
          />
        </GlowCard>
      </div>

      {/* Summary Bar */}
      <GlowCard className="p-5" glowColor="violet">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="text-center md:text-left">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Periodsammanfattning</div>
              <div className="text-sm text-slate-600 mt-1">{dateRange.label}</div>
            </div>
            <div className="h-8 w-px bg-slate-200 hidden md:block" />
            <div className="flex items-center gap-8">
              <div>
                <div className="text-xs text-slate-400">Nettoomsättning</div>
                <div className="text-lg font-bold text-slate-800">
                  {(data.summary.revenueExVat || data.breakdown.revenue.exVat || (data.summary.revenue - (data.summary.tax || 0))).toLocaleString('sv-SE')} kr
                </div>
              </div>
              <div className="text-slate-300 text-2xl">→</div>
              <div>
                <div className="text-xs text-slate-400">Kostnader</div>
                <div className="text-lg font-bold text-rose-600">
                  -{data.breakdown.costs.total.toLocaleString('sv-SE')} kr
                </div>
              </div>
              <div className="text-slate-300 text-2xl">=</div>
              <div>
                <div className="text-xs text-slate-400">Nettovinst</div>
                <div className="text-lg font-bold text-emerald-600">
                  {data.summary.profit >= 0 ? '+' : ''}{data.summary.profit.toLocaleString('sv-SE')} kr
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              data.summary.margin >= 30
                ? 'bg-emerald-50 text-emerald-700'
                : data.summary.margin >= 15
                ? 'bg-amber-50 text-amber-700'
                : 'bg-rose-50 text-rose-700'
            }`}>
              {data.summary.margin.toFixed(1)}% margin
            </div>
          </div>
        </div>
      </GlowCard>
    </div>
  )
}

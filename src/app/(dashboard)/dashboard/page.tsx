'use client'

import { useState, useEffect, useCallback } from 'react'
import { StatCard } from '@/components/dashboard/StatCard'
import { RevenueFlowChart } from '@/components/dashboard/RevenueFlowChart'
import { CostWaterfallChart } from '@/components/dashboard/CostWaterfallChart'
import { TopProductsCard } from '@/components/dashboard/TopProductsCard'
import { ProfitMeter } from '@/components/dashboard/ProfitMeter'
import { OnboardingProgress, defaultOnboardingSteps } from '@/components/dashboard/OnboardingProgress'
import { DateRangePicker, getDefaultDateRange } from '@/components/dashboard/DateRangePicker'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { SyncButton } from '@/components/dashboard/SyncButton'
import { GlowCard } from '@/components/dashboard/GlowCard'
import { ComparisonToggle, ComparisonSummary, getPreviousPeriod } from '@/components/dashboard/ComparisonToggle'
import { BreakEvenCard } from '@/components/dashboard/BreakEvenCard'
import { BenchmarkCard } from '@/components/dashboard/BenchmarkCard'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Package,
  Percent,
  Wallet,
  Target,
  AlertTriangle,
  Receipt,
} from 'lucide-react'

interface DashboardData {
  summary: {
    revenue: number  // Gross revenue (matches Shopify "Omsättning")
    revenueExVat?: number  // Revenue excluding VAT
    netRevenue?: number  // After VAT, discounts, refunds
    tax?: number  // VAT amount
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
      exVat?: number  // Revenue excluding VAT
      net: number
    }
    costs: {
      vat?: number
      cogs: number
      shipping: number
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
    impressions: number
    clicks: number
    conversions: number
  }
  dataQuality: {
    totalLineItems: number
    unmatchedLineItems: number
    cogsCompleteness: number
  }
}

// Demo data for when no real data is available
const demoData: DashboardData = {
  summary: {
    revenue: 495000,  // Matches Shopify "Omsättning" (totalPrice)
    revenueExVat: 396000,  // Revenue excluding VAT (25%)
    netRevenue: 458750,  // After discounts etc
    tax: 99000,  // VAT amount
    costs: 287420,
    profit: 171330,
    margin: 37.3,
    grossMargin: 45.2,
    orders: 1247,
    avgOrderValue: 396,
  },
  breakdown: {
    revenue: {
      gross: 495000,
      discounts: 24500,
      refunds: 11750,
      shipping: 42000,
      tax: 99000,
      net: 458750,
    },
    costs: {
      cogs: 145000,
      shipping: 42000,
      fees: 28500,
      adSpend: 52000,
      fixed: 15000,
      variable: 0,
      salaries: 4920,
      recurring: 0,
      oneTime: 0,
      total: 287420,
    },
    profit: {
      gross: 229750,
      operating: 201250,
      net: 171330,
    },
  },
  chartData: {
    daily: [
      { date: '2025-01-01', revenue: 12500, shipping: 1200, tax: 2500, discounts: 500, refunds: 0, orders: 34 },
      { date: '2025-01-04', revenue: 15200, shipping: 1450, tax: 3040, discounts: 600, refunds: 200, orders: 41 },
      { date: '2025-01-07', revenue: 13800, shipping: 1320, tax: 2760, discounts: 450, refunds: 0, orders: 37 },
      { date: '2025-01-10', revenue: 18400, shipping: 1760, tax: 3680, discounts: 800, refunds: 0, orders: 50 },
      { date: '2025-01-13', revenue: 16900, shipping: 1615, tax: 3380, discounts: 700, refunds: 150, orders: 46 },
      { date: '2025-01-16', revenue: 14800, shipping: 1415, tax: 2960, discounts: 550, refunds: 0, orders: 40 },
      { date: '2025-01-19', revenue: 19200, shipping: 1835, tax: 3840, discounts: 850, refunds: 0, orders: 52 },
      { date: '2025-01-22', revenue: 21300, shipping: 2035, tax: 4260, discounts: 950, refunds: 300, orders: 58 },
      { date: '2025-01-25', revenue: 19600, shipping: 1870, tax: 3920, discounts: 800, refunds: 0, orders: 53 },
      { date: '2025-01-28', revenue: 23100, shipping: 2205, tax: 4620, discounts: 1000, refunds: 0, orders: 63 },
    ],
    costBreakdown: [
      { name: 'Moms (VAT)', value: 99000, color: '#dc2626' },
      { name: 'COGS', value: 145000, color: '#3b82f6' },
      { name: 'Ad Spend', value: 52000, color: '#8b5cf6' },
      { name: 'Shipping', value: 42000, color: '#f43f5e' },
      { name: 'Payment Fees', value: 28500, color: '#f59e0b' },
      { name: 'Fixed Costs', value: 15000, color: '#06b6d4' },
      { name: 'Salaries', value: 4920, color: '#22c55e' },
    ],
  },
  ads: {
    spend: 52000,
    revenue: 145600,
    roas: 2.8,
    impressions: 1250000,
    clicks: 45000,
    conversions: 890,
  },
  dataQuality: {
    totalLineItems: 0,
    unmatchedLineItems: 0,
    cogsCompleteness: 100,
  },
}

const demoTopProducts = [
  { id: '1', name: 'Premium Hoodie Black', sku: 'HOD-BLK-001', revenue: 89400, profit: 42500, margin: 47.5, orders: 156, trend: 'up' as const },
  { id: '2', name: 'Classic T-Shirt White', sku: 'TSH-WHT-001', revenue: 67200, profit: 38100, margin: 56.7, orders: 284, trend: 'up' as const },
  { id: '3', name: 'Joggers Pro Grey', sku: 'JOG-GRY-001', revenue: 54300, profit: 28700, margin: 52.8, orders: 121, trend: 'stable' as const },
  { id: '4', name: 'Cap Snapback Navy', sku: 'CAP-NVY-001', revenue: 32100, profit: 19200, margin: 59.8, orders: 198, trend: 'down' as const },
  { id: '5', name: 'Socks 3-Pack', sku: 'SOC-MIX-003', revenue: 28400, profit: 17600, margin: 62.0, orders: 312, trend: 'up' as const },
]

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
  const [showOnboarding, setShowOnboarding] = useState(true)
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isUsingDemoData, setIsUsingDemoData] = useState(false)
  const [comparisonEnabled, setComparisonEnabled] = useState(false)
  const [previousData, setPreviousData] = useState<DashboardData | null>(null)
  const [topProducts, setTopProducts] = useState<TopProduct[]>([])
  const [topProductsLoading, setTopProductsLoading] = useState(true)

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

      // Check if we have real data or should use demo
      if (result.summary.orders === 0) {
        setData(demoData)
        setIsUsingDemoData(true)
      } else {
        setData(result)
        setIsUsingDemoData(false)
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setData(demoData)
      setIsUsingDemoData(true)
      setError('Could not load real data. Showing demo data.')
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
          if (result.products && result.products.length > 0) {
            setTopProducts(result.products)
          } else {
            setTopProducts(demoTopProducts)
          }
        } else {
          setTopProducts(demoTopProducts)
        }
      } catch {
        setTopProducts(demoTopProducts)
      } finally {
        setTopProductsLoading(false)
      }
    }

    fetchTopProducts()
  }, [dateRange])

  // Fetch comparison period data when enabled
  useEffect(() => {
    if (!comparisonEnabled) {
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
          setPreviousData(result.summary.orders === 0 ? demoData : result)
        }
      } catch {
        // Use demo data for comparison
        setPreviousData({
          ...demoData,
          summary: {
            ...demoData.summary,
            revenue: demoData.summary.revenue * 0.85,
            profit: demoData.summary.profit * 0.78,
            orders: Math.floor(demoData.summary.orders * 0.9),
            margin: demoData.summary.margin - 2,
          },
        })
      }
    }

    fetchPreviousPeriod()
  }, [comparisonEnabled, dateRange])

  // Use data or demo fallback
  const displayData = data || demoData
  const previousPeriod = getPreviousPeriod(dateRange)
  const comparisonData = previousData || demoData

  // Generate trend data for sparklines
  const revenueTrend = generateTrendData(displayData.summary.revenue, displayData.summary.revenue * 0.05, 14)
  const profitTrend = generateTrendData(displayData.summary.profit, displayData.summary.profit * 0.07, 14)
  const ordersTrend = generateTrendData(displayData.summary.orders, displayData.summary.orders * 0.1, 14)
  const marginTrend = generateTrendData(displayData.summary.margin, 5, 14)

  // Transform daily data for charts
  const profitChartData = displayData.chartData.daily.map(day => ({
    date: new Date(day.date).toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' }),
    revenue: day.revenue,
    costs: day.revenue * (displayData.breakdown.costs.total / displayData.summary.revenue) || 0,
    profit: day.revenue - (day.revenue * (displayData.breakdown.costs.total / displayData.summary.revenue) || 0),
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

      {/* Demo Data Notice */}
      {isUsingDemoData && (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            {error || 'Visar demodata. Koppla din Shopify-butik för att se riktiga siffror.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Comparison Summary */}
      {comparisonEnabled && (
        <ComparisonSummary
          currentPeriod={dateRange}
          previousPeriod={previousPeriod}
          metrics={{
            revenue: { current: displayData.summary.revenue, previous: comparisonData.summary.revenue * 0.85 },
            profit: { current: displayData.summary.profit, previous: comparisonData.summary.profit * 0.78 },
            orders: { current: displayData.summary.orders, previous: Math.floor(comparisonData.summary.orders * 0.9) },
            margin: { current: displayData.summary.margin, previous: comparisonData.summary.margin - 2 },
          }}
          loading={loading}
        />
      )}

      {/* Data Quality Warning */}
      {!isUsingDemoData && displayData.dataQuality.cogsCompleteness < 80 && (
        <Alert className="bg-blue-50 border-blue-200">
          <AlertTriangle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            Only {displayData.dataQuality.cogsCompleteness.toFixed(0)}% of your products have COGS set.
            Add COGS data for more accurate profit calculations.
          </AlertDescription>
        </Alert>
      )}

      {/* Onboarding Progress */}
      {showOnboarding && isUsingDemoData && (
        <OnboardingProgress
          steps={defaultOnboardingSteps}
          onDismiss={() => setShowOnboarding(false)}
        />
      )}

      {/* Primary KPIs - Big Numbers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue */}
        <StatCard
          title="Revenue"
          value={displayData.summary.revenue}
          suffix=" kr"
          icon={DollarSign}
          iconBgColor="bg-blue-50"
          iconColor="text-blue-600"
          trend={revenueTrend}
          loading={loading}
        />

        {/* Net Profit */}
        <StatCard
          title="Net Profit"
          value={displayData.summary.profit}
          suffix=" kr"
          icon={TrendingUp}
          iconBgColor="bg-emerald-50"
          iconColor="text-emerald-600"
          trend={profitTrend}
          loading={loading}
        />

        {/* Profit Margin */}
        <StatCard
          title="Profit Margin"
          value={displayData.summary.margin}
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
          value={displayData.summary.orders}
          icon={ShoppingCart}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
          trend={ordersTrend}
          loading={loading}
          compact
        />
        <StatCard
          title="Avg Order Value"
          value={displayData.summary.avgOrderValue}
          suffix=" kr"
          icon={Package}
          iconBgColor="bg-cyan-50"
          iconColor="text-cyan-600"
          loading={loading}
          compact
        />
        <StatCard
          title="Moms (VAT)"
          value={displayData.summary.tax || displayData.breakdown.revenue.tax || 0}
          suffix=" kr"
          icon={Receipt}
          iconBgColor="bg-red-50"
          iconColor="text-red-600"
          loading={loading}
          compact
        />
        <StatCard
          title="Ad Spend"
          value={displayData.ads.spend}
          suffix=" kr"
          icon={Target}
          iconBgColor="bg-rose-50"
          iconColor="text-rose-600"
          loading={loading}
          compact
        />
        <StatCard
          title="ROAS"
          value={displayData.ads.roas}
          suffix="x"
          icon={Wallet}
          iconBgColor="bg-indigo-50"
          iconColor="text-indigo-600"
          loading={loading}
          compact
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Revenue Flow Chart */}
        <RevenueFlowChart data={profitChartData} loading={loading} />

        {/* Profit Meter */}
        <GlowCard className="p-6" glowColor="emerald">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Vinsthälsa</h2>
          <p className="text-sm text-slate-500 mb-4">Din nuvarande lönsamhet i en överblick</p>
          <ProfitMeter
            revenue={displayData.summary.revenue}
            costs={displayData.breakdown.costs.total}
            profit={displayData.summary.profit}
          />
        </GlowCard>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Cost Breakdown */}
        <CostWaterfallChart
          data={displayData.chartData.costBreakdown}
          total={displayData.breakdown.costs.total}
          loading={loading}
        />

        {/* Top Products */}
        <TopProductsCard products={topProducts.length > 0 ? topProducts : demoTopProducts} loading={topProductsLoading} />
      </div>

      {/* Analytics Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Break-Even Analysis */}
        <BreakEvenCard
          revenue={displayData.summary.revenue}
          profit={displayData.summary.profit}
          costs={displayData.breakdown.costs.total}
          avgOrderValue={displayData.summary.avgOrderValue}
          avgMargin={displayData.summary.margin}
          daysInPeriod={Math.ceil((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1}
          daysElapsed={Math.ceil((new Date().getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24))}
        />

        {/* Industry Benchmark */}
        <BenchmarkCard
          industry="general"
          margin={displayData.summary.margin}
          cogsPercent={displayData.summary.revenue > 0 ? (displayData.breakdown.costs.cogs / displayData.summary.revenue) * 100 : 0}
          shippingPercent={displayData.breakdown.revenue?.shipping && displayData.summary.revenue > 0 ? (displayData.breakdown.revenue.shipping / displayData.summary.revenue) * 100 : 0}
        />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Snabbåtgärder</h2>
        <QuickActions />
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
                <div className="text-xs text-slate-400">Omsättning</div>
                <div className="text-lg font-bold text-slate-800">
                  {displayData.summary.revenue.toLocaleString('sv-SE')} kr
                </div>
              </div>
              <div className="text-slate-300 text-2xl">→</div>
              <div>
                <div className="text-xs text-slate-400">Kostnader</div>
                <div className="text-lg font-bold text-rose-600">
                  -{displayData.breakdown.costs.total.toLocaleString('sv-SE')} kr
                </div>
              </div>
              <div className="text-slate-300 text-2xl">=</div>
              <div>
                <div className="text-xs text-slate-400">Nettovinst</div>
                <div className="text-lg font-bold text-emerald-600">
                  {displayData.summary.profit >= 0 ? '+' : ''}{displayData.summary.profit.toLocaleString('sv-SE')} kr
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              displayData.summary.margin >= 30
                ? 'bg-emerald-50 text-emerald-700'
                : displayData.summary.margin >= 15
                ? 'bg-amber-50 text-amber-700'
                : 'bg-rose-50 text-rose-700'
            }`}>
              {displayData.summary.margin.toFixed(1)}% margin
            </div>
          </div>
        </div>
      </GlowCard>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { StatCard } from '@/components/dashboard/StatCard'
import { RevenueFlowChart } from '@/components/dashboard/RevenueFlowChart'
import { CostWaterfallChart } from '@/components/dashboard/CostWaterfallChart'
import { TopProductsCard } from '@/components/dashboard/TopProductsCard'
import { ProfitMeter } from '@/components/dashboard/ProfitMeter'
import { OnboardingProgress, defaultOnboardingSteps } from '@/components/dashboard/OnboardingProgress'
import { DateRangePicker, getDefaultDateRange } from '@/components/dashboard/DateRangePicker'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { GlowCard } from '@/components/dashboard/GlowCard'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Package,
  Percent,
  Wallet,
  Target,
} from 'lucide-react'

// Demo data - will be replaced with real API calls
const generateTrendData = (base: number, variance: number, length: number) => {
  const data = []
  let current = base
  for (let i = 0; i < length; i++) {
    current = current + (Math.random() - 0.45) * variance
    data.push(Math.max(0, current))
  }
  return data
}

const demoMetrics = {
  revenue: 458750,
  previousRevenue: 412300,
  costs: 287420,
  previousCosts: 268100,
  profit: 171330,
  previousProfit: 144200,
  margin: 37.3,
  orders: 1247,
  previousOrders: 1089,
  avgOrderValue: 368,
  adSpend: 52000,
  roas: 2.8,
}

const demoProfitData = [
  { date: 'Jan 1', revenue: 12500, costs: 7800, profit: 4700 },
  { date: 'Jan 4', revenue: 15200, costs: 9100, profit: 6100 },
  { date: 'Jan 7', revenue: 13800, costs: 8400, profit: 5400 },
  { date: 'Jan 10', revenue: 18400, costs: 11200, profit: 7200 },
  { date: 'Jan 13', revenue: 16900, costs: 10300, profit: 6600 },
  { date: 'Jan 16', revenue: 14800, costs: 9500, profit: 5300 },
  { date: 'Jan 19', revenue: 19200, costs: 11800, profit: 7400 },
  { date: 'Jan 22', revenue: 21300, costs: 12800, profit: 8500 },
  { date: 'Jan 25', revenue: 19600, costs: 11900, profit: 7700 },
  { date: 'Jan 28', revenue: 23100, costs: 13500, profit: 9600 },
]

const demoCostBreakdown = [
  { name: 'COGS', value: 145000, color: '#3b82f6' },
  { name: 'Ad Spend', value: 52000, color: '#8b5cf6' },
  { name: 'Shipping', value: 42000, color: '#f43f5e' },
  { name: 'Payment Fees', value: 28500, color: '#f59e0b' },
  { name: 'Fixed Costs', value: 15000, color: '#06b6d4' },
  { name: 'Salaries', value: 4920, color: '#22c55e' },
]

const demoTopProducts = [
  { id: '1', name: 'Premium Hoodie Black', sku: 'HOD-BLK-001', revenue: 89400, profit: 42500, margin: 47.5, orders: 156, trend: 'up' as const },
  { id: '2', name: 'Classic T-Shirt White', sku: 'TSH-WHT-001', revenue: 67200, profit: 38100, margin: 56.7, orders: 284, trend: 'up' as const },
  { id: '3', name: 'Joggers Pro Grey', sku: 'JOG-GRY-001', revenue: 54300, profit: 28700, margin: 52.8, orders: 121, trend: 'stable' as const },
  { id: '4', name: 'Cap Snapback Navy', sku: 'CAP-NVY-001', revenue: 32100, profit: 19200, margin: 59.8, orders: 198, trend: 'down' as const },
  { id: '5', name: 'Socks 3-Pack', sku: 'SOC-MIX-003', revenue: 28400, profit: 17600, margin: 62.0, orders: 312, trend: 'up' as const },
]

export default function DashboardPage() {
  const [dateRange, setDateRange] = useState(getDefaultDateRange())
  const [loading, setLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(true)

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800)
    return () => clearTimeout(timer)
  }, [])

  // Generate trend data for sparklines
  const revenueTrend = generateTrendData(400000, 20000, 14)
  const profitTrend = generateTrendData(150000, 10000, 14)
  const ordersTrend = generateTrendData(1100, 100, 14)
  const marginTrend = generateTrendData(35, 5, 14)

  const totalCosts = demoCostBreakdown.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Profit Dashboard</h1>
          <p className="text-slate-500 mt-1">
            Track your store&apos;s performance in real-time
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Onboarding Progress */}
      {showOnboarding && (
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
          value={demoMetrics.revenue}
          previousValue={demoMetrics.previousRevenue}
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
          value={demoMetrics.profit}
          previousValue={demoMetrics.previousProfit}
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
          value={demoMetrics.margin}
          suffix="%"
          icon={Percent}
          iconBgColor="bg-violet-50"
          iconColor="text-violet-600"
          trend={marginTrend}
          loading={loading}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Orders"
          value={demoMetrics.orders}
          previousValue={demoMetrics.previousOrders}
          icon={ShoppingCart}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
          trend={ordersTrend}
          loading={loading}
          compact
        />
        <StatCard
          title="Avg Order Value"
          value={demoMetrics.avgOrderValue}
          suffix=" kr"
          icon={Package}
          iconBgColor="bg-cyan-50"
          iconColor="text-cyan-600"
          loading={loading}
          compact
        />
        <StatCard
          title="Ad Spend"
          value={demoMetrics.adSpend}
          suffix=" kr"
          icon={Target}
          iconBgColor="bg-rose-50"
          iconColor="text-rose-600"
          loading={loading}
          compact
        />
        <StatCard
          title="ROAS"
          value={demoMetrics.roas}
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
        <RevenueFlowChart data={demoProfitData} loading={loading} />

        {/* Profit Meter */}
        <GlowCard className="p-6" glowColor="emerald">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Profit Health</h2>
          <p className="text-sm text-slate-500 mb-4">Your current profitability at a glance</p>
          <ProfitMeter
            revenue={demoMetrics.revenue}
            costs={demoMetrics.costs}
            profit={demoMetrics.profit}
          />
        </GlowCard>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Cost Breakdown */}
        <CostWaterfallChart
          data={demoCostBreakdown}
          total={totalCosts}
          loading={loading}
        />

        {/* Top Products */}
        <TopProductsCard products={demoTopProducts} loading={loading} />
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Quick Actions</h2>
        <QuickActions />
      </div>

      {/* Summary Bar */}
      <GlowCard className="p-5" glowColor="violet">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="text-center md:text-left">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Period Summary</div>
              <div className="text-sm text-slate-600 mt-1">{dateRange.label}</div>
            </div>
            <div className="h-8 w-px bg-slate-200 hidden md:block" />
            <div className="flex items-center gap-8">
              <div>
                <div className="text-xs text-slate-400">Revenue</div>
                <div className="text-lg font-bold text-slate-800">
                  {demoMetrics.revenue.toLocaleString('sv-SE')} kr
                </div>
              </div>
              <div className="text-slate-300 text-2xl">→</div>
              <div>
                <div className="text-xs text-slate-400">Costs</div>
                <div className="text-lg font-bold text-rose-600">
                  -{demoMetrics.costs.toLocaleString('sv-SE')} kr
                </div>
              </div>
              <div className="text-slate-300 text-2xl">=</div>
              <div>
                <div className="text-xs text-slate-400">Net Profit</div>
                <div className="text-lg font-bold text-emerald-600">
                  +{demoMetrics.profit.toLocaleString('sv-SE')} kr
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium">
              {demoMetrics.margin}% margin
            </div>
          </div>
        </div>
      </GlowCard>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { FileText, TrendingUp, TrendingDown, DollarSign, AlertCircle, Loader2 } from 'lucide-react'

interface PnLData {
  period: string
  dateRange: { start: string; end: string }
  revenue: {
    grossRevenue?: number  // New: Matches Shopify "Omsättning" (inkl VAT)
    grossSales: number     // Legacy fallback
    vat?: number           // VAT amount (pass-through)
    discounts: number
    returns: number
    shippingRevenue?: number  // What customer paid for shipping
    shipping: number       // Legacy fallback
    tax: number
    revenueExVat?: number  // Revenue excluding VAT (basis for profit)
    netRevenue: number     // Legacy fallback
  }
  cogs: {
    productCosts: number
    shippingCosts: number  // Our ACTUAL shipping cost (from tiers)
    totalCOGS: number
  }
  grossProfit: number
  grossMargin: number
  operatingExpenses: {
    marketing: {
      byPlatform: Record<string, number>
      total: number
    }
    paymentFees: {
      byGateway: Record<string, number>
      total: number
    }
    fixed: {
      byName: Record<string, number>
      salaries: number
      total: number
    }
    variable: {
      byName: Record<string, number>
      total: number
    }
    oneTime: number
    totalOpex: number
  }
  operatingProfit: number
  operatingMargin: number
  totalCosts?: number  // All business costs (excluding VAT)
  estimatedTax?: {
    rate: number
    amount: number
    profitAfterTax: number
  }
  // Legacy fields
  taxes?: {
    rate: number
    amount: number
  }
  netProfit: number
  netMargin: number
  orderCount: number
  avgOrderValue: number
}

// Demo P&L data for when there's no real data
const demoPnL: PnLData = {
  period: 'January 2025',
  dateRange: { start: '2025-01-01', end: '2025-01-31' },
  revenue: {
    grossSales: 523400,
    discounts: -15200,
    returns: -8600,
    shipping: 42000,
    tax: 104680,
    netRevenue: 499600,
  },
  cogs: {
    productCosts: 165000,
    shippingCosts: 42000,
    totalCOGS: 207000,
  },
  grossProfit: 292600,
  grossMargin: 58.6,
  operatingExpenses: {
    marketing: {
      byPlatform: { facebook: 35000, google: 22000, tiktok: 8000 },
      total: 65000,
    },
    paymentFees: {
      byGateway: { Stripe: 12500, Klarna: 8200, PayPal: 4300 },
      total: 25000,
    },
    fixed: {
      byName: { Rent: 15000, Software: 8500, Insurance: 2500 },
      salaries: 45000,
      total: 71000,
    },
    variable: {
      byName: { 'Office Supplies': 3000, Utilities: 2000 },
      total: 5000,
    },
    oneTime: 0,
    totalOpex: 166000,
  },
  operatingProfit: 126600,
  operatingMargin: 25.3,
  taxes: {
    rate: 20.6,
    amount: 26080,
  },
  netProfit: 100520,
  netMargin: 20.1,
  orderCount: 847,
  avgOrderValue: 590,
}

export default function PnLPage() {
  const [periodType, setPeriodType] = useState('month')
  const [pnlData, setPnlData] = useState<PnLData | null>(null)
  const [loading, setLoading] = useState(true)
  const [, setError] = useState<string | null>(null)
  const [isDemo, setIsDemo] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/pnl?periodType=${periodType}`)
        if (!response.ok) {
          throw new Error('Failed to fetch P&L data')
        }

        const data = await response.json()

        // Check if there's real data
        if (data.orderCount === 0) {
          setIsDemo(true)
          setPnlData(demoPnL)
        } else {
          setIsDemo(false)
          setPnlData(data)
        }
      } catch (err) {
        console.error('Error fetching P&L data:', err)
        setError('Failed to load P&L data')
        setIsDemo(true)
        setPnlData(demoPnL)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [periodType])

  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value)
    const formatted = absValue.toLocaleString('sv-SE', { maximumFractionDigits: 0 })
    return `${value < 0 ? '-' : ''}${formatted} kr`
  }

  const handleExportCSV = () => {
    if (!pnlData) return

    const grossRevenue = pnlData.revenue.grossRevenue || pnlData.revenue.grossSales
    const vat = pnlData.revenue.vat || pnlData.revenue.tax
    const revenueExVat = pnlData.revenue.revenueExVat || pnlData.revenue.netRevenue

    const rows = [
      ['P&L Report', pnlData.period],
      [''],
      ['INTÄKTER'],
      ['Omsättning (inkl. moms)', grossRevenue],
      ['Moms (pass-through)', -vat],
      ['Rabatter', pnlData.revenue.discounts],
      ['Returer & Återbetalningar', pnlData.revenue.returns],
      ['Nettoomsättning (ex. moms)', revenueExVat],
      [''],
      ['COGS (Varukostnad)'],
      ['Produktkostnader', -pnlData.cogs.productCosts],
      ['Fraktkostnader', -pnlData.cogs.shippingCosts],
      ['Total COGS', -pnlData.cogs.totalCOGS],
      [''],
      ['BRUTTOVINST', pnlData.grossProfit],
      ['Bruttomarginal', `${pnlData.grossMargin}%`],
      [''],
      ['RÖRELSEKOSTNADER'],
      ['Marknadsföring & Annonser', -pnlData.operatingExpenses.marketing.total],
      ['Betalningsavgifter', -pnlData.operatingExpenses.paymentFees.total],
      ['Fasta kostnader', -pnlData.operatingExpenses.fixed.total],
      ['Rörliga kostnader', -pnlData.operatingExpenses.variable.total],
      ['Engångskostnader', -pnlData.operatingExpenses.oneTime],
      ['Totala rörelsekostnader', -pnlData.operatingExpenses.totalOpex],
      [''],
      ['RÖRELSERESULTAT (EBIT)', pnlData.operatingProfit],
      ['Rörelsemarginal', `${pnlData.operatingMargin}%`],
      [''],
      ['NETTOVINST (disponibelt)', pnlData.netProfit],
      ['Nettomarginal', `${pnlData.netMargin}%`],
    ]

    const csv = rows.map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pnl-report-${pnlData.period.toLowerCase().replace(/\s+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (!pnlData) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load P&L data</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      {/* Demo Alert */}
      {isDemo && (
        <Alert className="bg-amber-50 border-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            Showing demo data. Connect a Shopify store and sync orders to see your real P&L.
          </AlertDescription>
        </Alert>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">P&L Report</h1>
          <p className="text-slate-600">Profit & Loss statement</p>
        </div>
        <div className="flex gap-2">
          <Select value={periodType} onValueChange={setPeriodType}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="quarter">This Quarter</SelectItem>
              <SelectItem value="year">This Year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExportCSV}>
            <FileText className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Net Revenue</p>
                <p className="text-2xl font-bold text-slate-800">
                  {formatCurrency(pnlData.revenue.netRevenue)}
                </p>
                <p className="text-xs text-slate-500">{pnlData.orderCount} orders</p>
              </div>
              <DollarSign className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Gross Profit</p>
                <p className="text-2xl font-bold text-slate-800">
                  {formatCurrency(pnlData.grossProfit)}
                </p>
                <p className="text-sm text-green-600">{pnlData.grossMargin}% margin</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Operating Profit</p>
                <p className="text-2xl font-bold text-slate-800">
                  {formatCurrency(pnlData.operatingProfit)}
                </p>
                <p className="text-sm text-green-600">{pnlData.operatingMargin}% margin</p>
              </div>
              <TrendingUp className="h-8 w-8 text-amber-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Net Profit</p>
                <p className={`text-2xl font-bold ${pnlData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(pnlData.netProfit)}
                </p>
                <p className={`text-sm ${pnlData.netMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {pnlData.netMargin}% margin
                </p>
              </div>
              {pnlData.netProfit >= 0 ? (
                <TrendingUp className="h-8 w-8 text-green-500 opacity-50" />
              ) : (
                <TrendingDown className="h-8 w-8 text-red-500 opacity-50" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Statement */}
      <Card>
        <CardHeader>
          <CardTitle>Profit & Loss Statement</CardTitle>
          <CardDescription>{pnlData.period}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Revenue Section */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center">
                <DollarSign className="w-5 h-5 mr-2 text-blue-500" />
                Intäkter
              </h3>
              <div className="space-y-2 pl-7">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Omsättning (inkl. moms)</span>
                  <span className="font-medium">{formatCurrency(pnlData.revenue.grossRevenue || pnlData.revenue.grossSales)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Moms (pass-through)</span>
                  <span className="font-medium text-slate-500">-{formatCurrency(pnlData.revenue.vat || pnlData.revenue.tax)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Rabatter</span>
                  <span className="font-medium text-red-600">{formatCurrency(pnlData.revenue.discounts)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Returer & Återbetalningar</span>
                  <span className="font-medium text-red-600">{formatCurrency(pnlData.revenue.returns)}</span>
                </div>
                <div className="flex justify-between py-2 bg-blue-50 px-3 rounded-lg font-semibold">
                  <span>Nettoomsättning (ex. moms)</span>
                  <span>{formatCurrency(pnlData.revenue.revenueExVat || pnlData.revenue.netRevenue)}</span>
                </div>
              </div>
            </div>

            {/* COGS Section */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center">
                <TrendingDown className="w-5 h-5 mr-2 text-red-500" />
                Cost of Goods Sold
              </h3>
              <div className="space-y-2 pl-7">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Product Costs</span>
                  <span className="font-medium text-red-600">-{formatCurrency(pnlData.cogs.productCosts)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Shipping Costs</span>
                  <span className="font-medium text-red-600">-{formatCurrency(pnlData.cogs.shippingCosts)}</span>
                </div>
                <div className="flex justify-between py-2 bg-red-50 px-3 rounded-lg font-semibold">
                  <span>Total COGS</span>
                  <span className="text-red-600">-{formatCurrency(pnlData.cogs.totalCOGS)}</span>
                </div>
              </div>
            </div>

            {/* Gross Profit */}
            <div className="flex justify-between py-3 bg-green-50 px-4 rounded-lg">
              <span className="font-bold text-green-800">Gross Profit</span>
              <div className="text-right">
                <span className="font-bold text-green-600">{formatCurrency(pnlData.grossProfit)}</span>
                <span className="text-sm text-green-600 ml-2">({pnlData.grossMargin}%)</span>
              </div>
            </div>

            {/* Operating Expenses */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center">
                <TrendingDown className="w-5 h-5 mr-2 text-amber-500" />
                Operating Expenses
              </h3>

              {/* Marketing */}
              {pnlData.operatingExpenses.marketing.total > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-700 mb-2 pl-7">Marketing & Advertising</p>
                  <div className="space-y-2 pl-7">
                    {Object.entries(pnlData.operatingExpenses.marketing.byPlatform).map(([platform, amount]) => (
                      <div key={platform} className="flex justify-between py-1 text-sm">
                        <span className="text-slate-500 capitalize">{platform} Ads</span>
                        <span className="text-red-600">-{formatCurrency(amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-1 border-t border-slate-200 font-medium">
                      <span className="text-slate-600">Total Marketing</span>
                      <span className="text-red-600">-{formatCurrency(pnlData.operatingExpenses.marketing.total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Fees */}
              {pnlData.operatingExpenses.paymentFees.total > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-700 mb-2 pl-7">Payment Processing Fees</p>
                  <div className="space-y-2 pl-7">
                    {Object.entries(pnlData.operatingExpenses.paymentFees.byGateway).map(([gateway, amount]) => (
                      <div key={gateway} className="flex justify-between py-1 text-sm">
                        <span className="text-slate-500">{gateway}</span>
                        <span className="text-red-600">-{formatCurrency(amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-1 border-t border-slate-200 font-medium">
                      <span className="text-slate-600">Total Payment Fees</span>
                      <span className="text-red-600">-{formatCurrency(pnlData.operatingExpenses.paymentFees.total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Fixed Costs */}
              {pnlData.operatingExpenses.fixed.total > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-700 mb-2 pl-7">Fixed Costs</p>
                  <div className="space-y-2 pl-7">
                    {Object.entries(pnlData.operatingExpenses.fixed.byName).map(([name, amount]) => (
                      <div key={name} className="flex justify-between py-1 text-sm">
                        <span className="text-slate-500">{name}</span>
                        <span className="text-red-600">-{formatCurrency(amount)}</span>
                      </div>
                    ))}
                    {pnlData.operatingExpenses.fixed.salaries > 0 && (
                      <div className="flex justify-between py-1 text-sm">
                        <span className="text-slate-500">Salaries</span>
                        <span className="text-red-600">-{formatCurrency(pnlData.operatingExpenses.fixed.salaries)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1 border-t border-slate-200 font-medium">
                      <span className="text-slate-600">Total Fixed Costs</span>
                      <span className="text-red-600">-{formatCurrency(pnlData.operatingExpenses.fixed.total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Variable Costs */}
              {pnlData.operatingExpenses.variable.total > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-slate-700 mb-2 pl-7">Variable Costs</p>
                  <div className="space-y-2 pl-7">
                    {Object.entries(pnlData.operatingExpenses.variable.byName).map(([name, amount]) => (
                      <div key={name} className="flex justify-between py-1 text-sm">
                        <span className="text-slate-500">{name}</span>
                        <span className="text-red-600">-{formatCurrency(amount)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-1 border-t border-slate-200 font-medium">
                      <span className="text-slate-600">Total Variable Costs</span>
                      <span className="text-red-600">-{formatCurrency(pnlData.operatingExpenses.variable.total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* One-time Costs */}
              {pnlData.operatingExpenses.oneTime > 0 && (
                <div className="mb-4 pl-7">
                  <div className="flex justify-between py-1 font-medium">
                    <span className="text-slate-600">One-time Costs</span>
                    <span className="text-red-600">-{formatCurrency(pnlData.operatingExpenses.oneTime)}</span>
                  </div>
                </div>
              )}

              {/* Total OpEx */}
              <div className="flex justify-between py-2 bg-amber-50 px-3 rounded-lg font-semibold ml-7">
                <span>Total Operating Expenses</span>
                <span className="text-red-600">-{formatCurrency(pnlData.operatingExpenses.totalOpex)}</span>
              </div>
            </div>

            {/* Operating Profit */}
            <div className="flex justify-between py-3 bg-blue-50 px-4 rounded-lg">
              <span className="font-bold text-blue-800">Operating Profit (EBIT)</span>
              <div className="text-right">
                <span className={`font-bold ${pnlData.operatingProfit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {formatCurrency(pnlData.operatingProfit)}
                </span>
                <span className={`text-sm ml-2 ${pnlData.operatingMargin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  ({pnlData.operatingMargin}%)
                </span>
              </div>
            </div>

            {/* Net Profit - MATCHES DASHBOARD */}
            <div className={`flex justify-between py-4 px-4 rounded-lg border-2 ${
              pnlData.netProfit >= 0
                ? 'bg-green-100 border-green-200'
                : 'bg-red-100 border-red-200'
            }`}>
              <span className={`font-bold text-lg ${pnlData.netProfit >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                Nettovinst
              </span>
              <div className="text-right">
                <span className={`font-bold text-lg ${pnlData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(pnlData.netProfit)}
                </span>
                <span className={`text-sm ml-2 ${pnlData.netMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ({pnlData.netMargin}%)
                </span>
              </div>
            </div>

            {/* Info about the profit figure */}
            <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-sm text-emerald-800">
                <strong>💡 Tips:</strong> Nettovinsten är beloppet du kan disponera via lön, utdelning eller återinvestering.
                Målet är ofta att optimera uttag så att bolagsvinsten blir minimal.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Order Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-600">Total Orders</span>
                <span className="font-medium">{pnlData.orderCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Average Order Value</span>
                <span className="font-medium">{formatCurrency(pnlData.avgOrderValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Revenue per Order</span>
                <span className="font-medium">
                  {formatCurrency(pnlData.orderCount > 0 ? pnlData.revenue.netRevenue / pnlData.orderCount : 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Profit per Order</span>
                <span className={`font-medium ${pnlData.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(pnlData.orderCount > 0 ? pnlData.netProfit / pnlData.orderCount : 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cost Structure</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-600">COGS % of Revenue</span>
                <span className="font-medium">
                  {pnlData.revenue.netRevenue > 0
                    ? ((pnlData.cogs.totalCOGS / pnlData.revenue.netRevenue) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Marketing % of Revenue</span>
                <span className="font-medium">
                  {pnlData.revenue.netRevenue > 0
                    ? ((pnlData.operatingExpenses.marketing.total / pnlData.revenue.netRevenue) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Payment Fees % of Revenue</span>
                <span className="font-medium">
                  {pnlData.revenue.netRevenue > 0
                    ? ((pnlData.operatingExpenses.paymentFees.total / pnlData.revenue.netRevenue) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Total OpEx % of Revenue</span>
                <span className="font-medium">
                  {pnlData.revenue.netRevenue > 0
                    ? ((pnlData.operatingExpenses.totalOpex / pnlData.revenue.netRevenue) * 100).toFixed(1)
                    : 0}%
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

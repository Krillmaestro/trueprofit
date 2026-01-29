'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Download, FileText, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'

// Demo P&L data
const demoPnL = {
  period: 'January 2025',
  revenue: {
    grossSales: 523400,
    discounts: -15200,
    returns: -8600,
    netRevenue: 499600,
  },
  cogs: {
    productCosts: 165000,
    shippingCosts: 42000,
    packagingCosts: 8500,
    totalCOGS: 215500,
  },
  grossProfit: 284100,
  grossMargin: 56.9,
  operatingExpenses: {
    marketing: {
      facebook: 35000,
      google: 22000,
      tiktok: 8000,
      other: 3500,
      total: 68500,
    },
    paymentFees: {
      stripe: 12500,
      klarna: 8200,
      paypal: 4300,
      total: 25000,
    },
    fixed: {
      rent: 15000,
      salaries: 45000,
      software: 8500,
      insurance: 2500,
      other: 5000,
      total: 76000,
    },
    totalOpex: 169500,
  },
  operatingProfit: 114600,
  operatingMargin: 22.9,
  taxes: 28650,
  netProfit: 85950,
  netMargin: 17.2,
}

export default function PnLPage() {
  const [period, setPeriod] = useState('january-2025')

  const formatCurrency = (value: number) => {
    return `${value.toLocaleString('sv-SE')} kr`
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">P&L Report</h1>
          <p className="text-slate-600">Profit & Loss statement</p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="january-2025">January 2025</SelectItem>
              <SelectItem value="december-2024">December 2024</SelectItem>
              <SelectItem value="q4-2024">Q4 2024</SelectItem>
              <SelectItem value="2024">Year 2024</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export PDF
          </Button>
          <Button variant="outline">
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
                  {formatCurrency(demoPnL.revenue.netRevenue)}
                </p>
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
                  {formatCurrency(demoPnL.grossProfit)}
                </p>
                <p className="text-sm text-green-600">{demoPnL.grossMargin}% margin</p>
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
                  {formatCurrency(demoPnL.operatingProfit)}
                </p>
                <p className="text-sm text-green-600">{demoPnL.operatingMargin}% margin</p>
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
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(demoPnL.netProfit)}
                </p>
                <p className="text-sm text-green-600">{demoPnL.netMargin}% margin</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* P&L Statement */}
      <Card>
        <CardHeader>
          <CardTitle>Profit & Loss Statement</CardTitle>
          <CardDescription>{demoPnL.period}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Revenue Section */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center">
                <DollarSign className="w-5 h-5 mr-2 text-blue-500" />
                Revenue
              </h3>
              <div className="space-y-2 pl-7">
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Gross Sales</span>
                  <span className="font-medium">{formatCurrency(demoPnL.revenue.grossSales)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Discounts</span>
                  <span className="font-medium text-red-600">{formatCurrency(demoPnL.revenue.discounts)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Returns & Refunds</span>
                  <span className="font-medium text-red-600">{formatCurrency(demoPnL.revenue.returns)}</span>
                </div>
                <div className="flex justify-between py-2 bg-slate-50 px-3 rounded-lg font-semibold">
                  <span>Net Revenue</span>
                  <span>{formatCurrency(demoPnL.revenue.netRevenue)}</span>
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
                  <span className="font-medium text-red-600">-{formatCurrency(demoPnL.cogs.productCosts)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Shipping Costs</span>
                  <span className="font-medium text-red-600">-{formatCurrency(demoPnL.cogs.shippingCosts)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100">
                  <span className="text-slate-600">Packaging Costs</span>
                  <span className="font-medium text-red-600">-{formatCurrency(demoPnL.cogs.packagingCosts)}</span>
                </div>
                <div className="flex justify-between py-2 bg-red-50 px-3 rounded-lg font-semibold">
                  <span>Total COGS</span>
                  <span className="text-red-600">-{formatCurrency(demoPnL.cogs.totalCOGS)}</span>
                </div>
              </div>
            </div>

            {/* Gross Profit */}
            <div className="flex justify-between py-3 bg-green-50 px-4 rounded-lg">
              <span className="font-bold text-green-800">Gross Profit</span>
              <div className="text-right">
                <span className="font-bold text-green-600">{formatCurrency(demoPnL.grossProfit)}</span>
                <span className="text-sm text-green-600 ml-2">({demoPnL.grossMargin}%)</span>
              </div>
            </div>

            {/* Operating Expenses */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-3 flex items-center">
                <TrendingDown className="w-5 h-5 mr-2 text-amber-500" />
                Operating Expenses
              </h3>

              {/* Marketing */}
              <div className="mb-4">
                <p className="text-sm font-medium text-slate-700 mb-2 pl-7">Marketing & Advertising</p>
                <div className="space-y-2 pl-7">
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-slate-500">Facebook Ads</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.marketing.facebook)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-slate-500">Google Ads</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.marketing.google)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-slate-500">TikTok Ads</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.marketing.tiktok)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-slate-500">Other Marketing</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.marketing.other)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-t border-slate-200 font-medium">
                    <span className="text-slate-600">Total Marketing</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.marketing.total)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Fees */}
              <div className="mb-4">
                <p className="text-sm font-medium text-slate-700 mb-2 pl-7">Payment Processing Fees</p>
                <div className="space-y-2 pl-7">
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-slate-500">Stripe</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.paymentFees.stripe)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-slate-500">Klarna</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.paymentFees.klarna)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-slate-500">PayPal</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.paymentFees.paypal)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-t border-slate-200 font-medium">
                    <span className="text-slate-600">Total Payment Fees</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.paymentFees.total)}</span>
                  </div>
                </div>
              </div>

              {/* Fixed Costs */}
              <div className="mb-4">
                <p className="text-sm font-medium text-slate-700 mb-2 pl-7">Fixed Costs</p>
                <div className="space-y-2 pl-7">
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-slate-500">Rent</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.fixed.rent)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-slate-500">Salaries</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.fixed.salaries)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-slate-500">Software & Tools</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.fixed.software)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-slate-500">Insurance</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.fixed.insurance)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-slate-500">Other</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.fixed.other)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-t border-slate-200 font-medium">
                    <span className="text-slate-600">Total Fixed Costs</span>
                    <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.fixed.total)}</span>
                  </div>
                </div>
              </div>

              {/* Total OpEx */}
              <div className="flex justify-between py-2 bg-amber-50 px-3 rounded-lg font-semibold pl-7">
                <span>Total Operating Expenses</span>
                <span className="text-red-600">-{formatCurrency(demoPnL.operatingExpenses.totalOpex)}</span>
              </div>
            </div>

            {/* Operating Profit */}
            <div className="flex justify-between py-3 bg-blue-50 px-4 rounded-lg">
              <span className="font-bold text-blue-800">Operating Profit (EBIT)</span>
              <div className="text-right">
                <span className="font-bold text-blue-600">{formatCurrency(demoPnL.operatingProfit)}</span>
                <span className="text-sm text-blue-600 ml-2">({demoPnL.operatingMargin}%)</span>
              </div>
            </div>

            {/* Taxes */}
            <div className="flex justify-between py-2 border-b border-slate-200 pl-4">
              <span className="text-slate-600">Income Tax (25%)</span>
              <span className="text-red-600">-{formatCurrency(demoPnL.taxes)}</span>
            </div>

            {/* Net Profit */}
            <div className="flex justify-between py-4 bg-green-100 px-4 rounded-lg border-2 border-green-200">
              <span className="font-bold text-green-800 text-lg">Net Profit</span>
              <div className="text-right">
                <span className="font-bold text-green-600 text-lg">{formatCurrency(demoPnL.netProfit)}</span>
                <span className="text-sm text-green-600 ml-2">({demoPnL.netMargin}%)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

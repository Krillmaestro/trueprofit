'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { Upload, Search, TrendingUp, TrendingDown, Wallet, CreditCard } from 'lucide-react'

// Demo data
const demoTransactions = [
  { id: '1', date: '2025-01-28', description: 'STRIPE PAYMENTS', amount: 45230, balance: 251445, category: 'Revenue', merchant: 'Stripe (Shopify)' },
  { id: '2', date: '2025-01-27', description: 'FACEBK ADS', amount: -12500, balance: 206215, category: 'Marketing', merchant: 'Facebook Ads' },
  { id: '3', date: '2025-01-27', description: 'NOTION LABS', amount: -599, balance: 218715, category: 'Software', merchant: 'Notion', isSubscription: true },
  { id: '4', date: '2025-01-26', description: 'INCOME SORTER FEE', amount: -1250, balance: 219314, category: 'Fees', merchant: 'Income Sorter' },
  { id: '5', date: '2025-01-26', description: 'STRIPE PAYMENTS', amount: 38750, balance: 220564, category: 'Revenue', merchant: 'Stripe (Shopify)' },
  { id: '6', date: '2025-01-25', description: 'GOOGLE ADS', amount: -8500, balance: 181814, category: 'Marketing', merchant: 'Google Ads' },
  { id: '7', date: '2025-01-25', description: 'ADOBE CREATIVE', amount: -1299, balance: 190314, category: 'Software', merchant: 'Adobe', isSubscription: true },
]

const categoryColors: Record<string, string> = {
  Revenue: '#22c55e',
  Marketing: '#8b5cf6',
  Software: '#3b82f6',
  Fees: '#f59e0b',
  Other: '#64748b',
}

const categoryBreakdown = [
  { name: 'Marketing', value: 21000, color: '#8b5cf6' },
  { name: 'Software', value: 1898, color: '#3b82f6' },
  { name: 'Fees', value: 1250, color: '#f59e0b' },
]

const balanceTrend = [
  { date: 'Jan 20', balance: 185000 },
  { date: 'Jan 22', balance: 198500 },
  { date: 'Jan 24', balance: 210200 },
  { date: 'Jan 26', balance: 220564 },
  { date: 'Jan 28', balance: 251445 },
]

export default function BankPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const totalIncome = demoTransactions.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0)
  const totalExpenses = Math.abs(demoTransactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + t.amount, 0))
  const currentBalance = demoTransactions[0]?.balance || 0

  const filteredTransactions = demoTransactions.filter((t) => {
    const matchesSearch = t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.merchant.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Bank & Finance</h1>
          <p className="text-slate-600">Track your bank transactions and cash flow</p>
        </div>
        <Button>
          <Upload className="w-4 h-4 mr-2" />
          Import CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Current Balance</p>
                <p className="text-2xl font-bold text-slate-800">
                  {currentBalance.toLocaleString('sv-SE')} kr
                </p>
              </div>
              <Wallet className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Income</p>
                <p className="text-2xl font-bold text-green-600">
                  +{totalIncome.toLocaleString('sv-SE')} kr
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Expenses</p>
                <p className="text-2xl font-bold text-red-600">
                  -{totalExpenses.toLocaleString('sv-SE')} kr
                </p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Net Change</p>
                <p className="text-2xl font-bold text-blue-600">
                  +{(totalIncome - totalExpenses).toLocaleString('sv-SE')} kr
                </p>
              </div>
              <CreditCard className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Balance Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Balance Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={balanceTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => [`${Number(value).toLocaleString('sv-SE')} kr`, 'Balance']} />
                <Line type="monotone" dataKey="balance" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Expense Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center">
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {categoryBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${Number(value).toLocaleString('sv-SE')} kr`]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {categoryBreakdown.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-sm text-slate-600">{item.name}</span>
                    <span className="text-sm font-medium">{item.value.toLocaleString('sv-SE')} kr</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Transactions</CardTitle>
              <CardDescription>All bank transactions with smart categorization</CardDescription>
            </div>
            <div className="flex gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="Revenue">Revenue</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="Software">Software</SelectItem>
                  <SelectItem value="Fees">Fees</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-slate-600">{t.date}</TableCell>
                  <TableCell className="font-medium">{t.description}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {t.merchant}
                      {t.isSubscription && (
                        <Badge variant="outline" className="text-xs">Subscription</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      style={{
                        backgroundColor: `${categoryColors[t.category]}20`,
                        color: categoryColors[t.category],
                      }}
                    >
                      {t.category}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right font-medium ${t.amount > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {t.amount > 0 ? '+' : ''}{t.amount.toLocaleString('sv-SE')} kr
                  </TableCell>
                  <TableCell className="text-right">{t.balance.toLocaleString('sv-SE')} kr</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

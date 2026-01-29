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
import { Search, Download, ShoppingCart, DollarSign, TrendingUp, Package } from 'lucide-react'

// Demo data
const demoOrders = [
  { id: '#1247', date: '2025-01-28', customer: 'Anna S.', items: 3, revenue: 1247, cogs: 420, fees: 45, profit: 782, margin: 62.7, status: 'Fulfilled' },
  { id: '#1246', date: '2025-01-28', customer: 'Erik L.', items: 1, revenue: 599, cogs: 180, fees: 22, profit: 397, margin: 66.3, status: 'Fulfilled' },
  { id: '#1245', date: '2025-01-27', customer: 'Maria K.', items: 2, revenue: 848, cogs: 285, fees: 31, profit: 532, margin: 62.7, status: 'Pending' },
  { id: '#1244', date: '2025-01-27', customer: 'Johan P.', items: 4, revenue: 1596, cogs: 540, fees: 58, profit: 998, margin: 62.5, status: 'Fulfilled' },
  { id: '#1243', date: '2025-01-26', customer: 'Lisa B.', items: 1, revenue: 299, cogs: 85, fees: 11, profit: 203, margin: 67.9, status: 'Fulfilled' },
]

export default function OrdersPage() {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredOrders = demoOrders.filter(
    (o) =>
      o.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.customer.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalRevenue = demoOrders.reduce((sum, o) => sum + o.revenue, 0)
  const totalProfit = demoOrders.reduce((sum, o) => sum + o.profit, 0)
  const avgMargin = demoOrders.reduce((sum, o) => sum + o.margin, 0) / demoOrders.length

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Orders</h1>
          <p className="text-slate-600">View and analyze order profitability</p>
        </div>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Orders</p>
                <p className="text-2xl font-bold text-slate-800">{demoOrders.length}</p>
              </div>
              <ShoppingCart className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Revenue</p>
                <p className="text-2xl font-bold text-slate-800">
                  {totalRevenue.toLocaleString('sv-SE')} kr
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Profit</p>
                <p className="text-2xl font-bold text-green-600">
                  {totalProfit.toLocaleString('sv-SE')} kr
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
                <p className="text-sm text-slate-600">Avg Margin</p>
                <p className="text-2xl font-bold text-slate-800">{avgMargin.toFixed(1)}%</p>
              </div>
              <Package className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Orders</CardTitle>
              <CardDescription>Order details with profit breakdown</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.id}</TableCell>
                  <TableCell className="text-slate-600">{order.date}</TableCell>
                  <TableCell>{order.customer}</TableCell>
                  <TableCell className="text-right">{order.items}</TableCell>
                  <TableCell className="text-right">{order.revenue} kr</TableCell>
                  <TableCell className="text-right text-red-600">-{order.cogs} kr</TableCell>
                  <TableCell className="text-right text-red-600">-{order.fees} kr</TableCell>
                  <TableCell className="text-right font-medium text-green-600">
                    {order.profit} kr
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={order.margin > 60 ? 'default' : 'secondary'}>
                      {order.margin.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={order.status === 'Fulfilled' ? 'default' : 'outline'}>
                      {order.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

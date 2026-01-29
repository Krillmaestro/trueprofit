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
import { Search, Download, Package, TrendingUp, DollarSign, Percent, ArrowUpDown } from 'lucide-react'

// Demo data
const demoProducts = [
  {
    id: '1',
    title: 'Premium Wireless Headphones',
    sku: 'WH-001',
    variant: 'Black',
    price: 1299,
    cogs: 420,
    margin: 67.7,
    sold: 156,
    revenue: 202644,
    profit: 137124,
    status: 'active',
    image: null,
  },
  {
    id: '2',
    title: 'Bluetooth Speaker Pro',
    sku: 'BS-002',
    variant: 'Silver',
    price: 899,
    cogs: 280,
    margin: 68.9,
    sold: 98,
    revenue: 88102,
    profit: 60662,
    status: 'active',
    image: null,
  },
  {
    id: '3',
    title: 'USB-C Charging Cable 2m',
    sku: 'CC-003',
    variant: 'White',
    price: 149,
    cogs: 25,
    margin: 83.2,
    sold: 432,
    revenue: 64368,
    profit: 53568,
    status: 'active',
    image: null,
  },
  {
    id: '4',
    title: 'Laptop Stand Aluminum',
    sku: 'LS-004',
    variant: 'Space Gray',
    price: 599,
    cogs: 180,
    margin: 69.9,
    sold: 78,
    revenue: 46722,
    profit: 32682,
    status: 'active',
    image: null,
  },
  {
    id: '5',
    title: 'Wireless Mouse Ergonomic',
    sku: 'WM-005',
    variant: 'Black',
    price: 449,
    cogs: 140,
    margin: 68.8,
    sold: 124,
    revenue: 55676,
    profit: 38316,
    status: 'low_stock',
    image: null,
  },
]

export default function ProductsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('revenue')

  const filteredProducts = demoProducts
    .filter(
      (p) =>
        p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'revenue') return b.revenue - a.revenue
      if (sortBy === 'profit') return b.profit - a.profit
      if (sortBy === 'margin') return b.margin - a.margin
      if (sortBy === 'sold') return b.sold - a.sold
      return 0
    })

  const totalRevenue = demoProducts.reduce((sum, p) => sum + p.revenue, 0)
  const totalProfit = demoProducts.reduce((sum, p) => sum + p.profit, 0)
  const totalSold = demoProducts.reduce((sum, p) => sum + p.sold, 0)
  const avgMargin = demoProducts.reduce((sum, p) => sum + p.margin, 0) / demoProducts.length

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Products</h1>
          <p className="text-slate-600">Analyze product profitability and performance</p>
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
                <p className="text-sm text-slate-600">Total Products</p>
                <p className="text-2xl font-bold text-slate-800">{demoProducts.length}</p>
              </div>
              <Package className="h-8 w-8 text-blue-500 opacity-50" />
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
              <Percent className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Product Performance</CardTitle>
              <CardDescription>Revenue and profit by product</CardDescription>
            </div>
            <div className="flex gap-4">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40">
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">Revenue</SelectItem>
                  <SelectItem value="profit">Profit</SelectItem>
                  <SelectItem value="margin">Margin</SelectItem>
                  <SelectItem value="sold">Units Sold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{product.title}</p>
                      <p className="text-sm text-slate-500">{product.variant}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600">{product.sku}</TableCell>
                  <TableCell className="text-right">{product.price} kr</TableCell>
                  <TableCell className="text-right text-red-600">-{product.cogs} kr</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={product.margin > 60 ? 'default' : 'secondary'}>
                      {product.margin.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{product.sold}</TableCell>
                  <TableCell className="text-right font-medium">
                    {product.revenue.toLocaleString('sv-SE')} kr
                  </TableCell>
                  <TableCell className="text-right font-medium text-green-600">
                    {product.profit.toLocaleString('sv-SE')} kr
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        product.status === 'active'
                          ? 'default'
                          : product.status === 'low_stock'
                          ? 'outline'
                          : 'secondary'
                      }
                    >
                      {product.status === 'active'
                        ? 'Active'
                        : product.status === 'low_stock'
                        ? 'Low Stock'
                        : 'Inactive'}
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

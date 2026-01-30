'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Download, Package, TrendingUp, DollarSign, Percent, ArrowUpDown, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'

interface Product {
  id: string
  title: string
  handle: string
  vendor: string | null
  productType: string | null
  status: string
  imageUrl: string | null
  variants: number
  unitsSold: number
  revenue: number
  cogs: number
  profit: number
  margin: number
  orders: number
  avgPrice: number
  hasCOGS: boolean
  currency: string
}

interface ProductsData {
  products: Product[]
  totals: {
    unitsSold: number
    revenue: number
    cogs: number
    profit: number
    avgMargin: number
    productCount: number
  }
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export default function ProductsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('revenue')
  const [data, setData] = useState<ProductsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '50',
        })
        if (searchTerm) {
          params.set('search', searchTerm)
        }

        const res = await fetch(`/api/products?${params}`)
        if (res.ok) {
          const json = await res.json()
          setData(json)
        }
      } catch (error) {
        console.error('Failed to fetch products:', error)
      } finally {
        setLoading(false)
      }
    }

    const timeout = setTimeout(fetchProducts, searchTerm ? 300 : 0)
    return () => clearTimeout(timeout)
  }, [page, searchTerm])

  const formatCurrency = (amount: number, currency = 'SEK') => {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const sortedProducts = useMemo(() => {
    if (!data?.products) return []
    return [...data.products].sort((a, b) => {
      if (sortBy === 'revenue') return b.revenue - a.revenue
      if (sortBy === 'profit') return b.profit - a.profit
      if (sortBy === 'margin') return b.margin - a.margin
      if (sortBy === 'sold') return b.unitsSold - a.unitsSold
      return 0
    })
  }, [data?.products, sortBy])

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  const products = sortedProducts
  const totals = data?.totals || { unitsSold: 0, revenue: 0, profit: 0, avgMargin: 0, productCount: 0 }
  const pagination = data?.pagination || { page: 1, totalPages: 1, total: 0 }

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
                <p className="text-2xl font-bold text-slate-800">{pagination.total.toLocaleString()}</p>
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
                  {formatCurrency(totals.revenue)}
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
                <p className={`text-2xl font-bold ${totals.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(totals.profit)}
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
                <p className="text-2xl font-bold text-slate-800">{totals.avgMargin.toFixed(1)}%</p>
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
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setPage(1)
                  }}
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
          {products.length === 0 ? (
            <EmptyState
              type="products"
              customTitle={searchTerm ? 'Inga produkter hittades' : undefined}
              customDescription={searchTerm ? `Inga produkter matchar "${searchTerm}". Prova en annan sökning.` : undefined}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt={product.title}
                              width={40}
                              height={40}
                              className="rounded object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="w-10 h-10 rounded bg-slate-100 flex items-center justify-center">
                              <Package className="w-5 h-5 text-slate-400" />
                            </div>
                          )}
                          <div>
                            <p className="font-medium truncate max-w-[200px]">{product.title}</p>
                            <p className="text-sm text-slate-500">{product.variants} variant{product.variants !== 1 ? 's' : ''}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600">{product.vendor || '-'}</TableCell>
                      <TableCell className="text-right">{formatCurrency(product.avgPrice, product.currency)}</TableCell>
                      <TableCell className="text-right">
                        {product.hasCOGS ? (
                          <span className="text-red-600">-{formatCurrency(product.cogs, product.currency)}</span>
                        ) : (
                          <span className="flex items-center justify-end gap-1 text-amber-600">
                            <AlertCircle className="w-3 h-3" />
                            Not set
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {product.hasCOGS ? (
                          <Badge variant={product.margin > 50 ? 'default' : product.margin > 20 ? 'secondary' : 'destructive'}>
                            {product.margin.toFixed(1)}%
                          </Badge>
                        ) : (
                          <Badge variant="outline">N/A</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{product.unitsSold.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(product.revenue, product.currency)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${product.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(product.profit, product.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            product.status === 'active'
                              ? 'default'
                              : product.status === 'draft'
                              ? 'outline'
                              : 'secondary'
                          }
                        >
                          {product.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-slate-600">
                    Showing {((pagination.page - 1) * 50) + 1} to {Math.min(pagination.page * 50, pagination.total)} of {pagination.total} products
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={pagination.page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                      disabled={pagination.page === pagination.totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

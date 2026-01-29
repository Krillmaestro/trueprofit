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
import { Search, Upload, Download, DollarSign, Package, TrendingUp } from 'lucide-react'

// Demo data
const demoProducts = [
  { id: '1', title: 'Premium T-Shirt', sku: 'TSH-001', price: 299, cogs: 85, margin: 71.6, stock: 245 },
  { id: '2', title: 'Hoodie Classic', sku: 'HOD-001', price: 599, cogs: 180, margin: 69.9, stock: 128 },
  { id: '3', title: 'Cap Snapback', sku: 'CAP-001', price: 249, cogs: 65, margin: 73.9, stock: 312 },
  { id: '4', title: 'Joggers Pro', sku: 'JOG-001', price: 449, cogs: 145, margin: 67.7, stock: 89 },
  { id: '5', title: 'Socks 3-Pack', sku: 'SOC-003', price: 149, cogs: 35, margin: 76.5, stock: 523 },
]

export default function COGSPage() {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredProducts = demoProducts.filter(
    (p) =>
      p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalInventoryValue = demoProducts.reduce((sum, p) => sum + p.cogs * p.stock, 0)
  const totalRetailValue = demoProducts.reduce((sum, p) => sum + p.price * p.stock, 0)
  const avgMargin = demoProducts.reduce((sum, p) => sum + p.margin, 0) / demoProducts.length

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">COGS Management</h1>
          <p className="text-slate-600">Manage Cost of Goods Sold for your products</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button>
            <Upload className="w-4 h-4 mr-2" />
            Import CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Total Inventory Value</p>
                <p className="text-2xl font-bold text-slate-800">
                  {totalInventoryValue.toLocaleString('sv-SE')} kr
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
                <p className="text-sm text-slate-600">Total Retail Value</p>
                <p className="text-2xl font-bold text-slate-800">
                  {totalRetailValue.toLocaleString('sv-SE')} kr
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
                <p className="text-sm text-slate-600">Average Margin</p>
                <p className="text-2xl font-bold text-slate-800">{avgMargin.toFixed(1)}%</p>
              </div>
              <Package className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600">Products with COGS</p>
                <p className="text-2xl font-bold text-slate-800">
                  {demoProducts.length} / {demoProducts.length}
                </p>
              </div>
              <div className="text-green-500 text-sm font-medium">100%</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Product COGS</CardTitle>
              <CardDescription>Set and manage COGS for each product variant</CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search products..."
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
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">COGS</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Inventory Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.title}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{product.sku}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{product.price} kr</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      defaultValue={product.cogs}
                      className="w-24 text-right ml-auto"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={product.margin > 70 ? 'default' : product.margin > 50 ? 'secondary' : 'destructive'}
                    >
                      {product.margin.toFixed(1)}%
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{product.stock}</TableCell>
                  <TableCell className="text-right font-medium">
                    {(product.cogs * product.stock).toLocaleString('sv-SE')} kr
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

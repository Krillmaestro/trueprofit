'use client'

import { useState, useEffect, useCallback } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, Upload, Download, DollarSign, Package, TrendingUp, Save, Loader2 } from 'lucide-react'

interface ProductCOGS {
  variantId: string
  shopifyVariantId: bigint
  productId: string
  productTitle: string
  variantTitle: string | null
  sku: string | null
  price: number
  inventoryQuantity: number
  imageUrl: string | null
  store: { id: string; name: string | null; currency: string | null }
  cogs: { costPrice: number; source: string } | null
  hasCogs: boolean
  vatRate: number
}

// Swedish VAT rates
const VAT_RATES = [
  { value: '25', label: '25% (Standard)' },
  { value: '12', label: '12% (Food, hotels)' },
  { value: '6', label: '6% (Books, culture)' },
  { value: '0', label: '0% (Export, exempt)' },
]

export default function COGSPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [products, setProducts] = useState<ProductCOGS[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [pendingChanges, setPendingChanges] = useState<Map<string, { cogs?: number; vatRate?: number }>>(new Map())

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/cogs')
      if (res.ok) {
        const data = await res.json()
        setProducts(data)
      }
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const handleCogsChange = (variantId: string, value: string) => {
    const numValue = parseFloat(value) || 0
    setPendingChanges(prev => {
      const updated = new Map(prev)
      const existing = updated.get(variantId) || {}
      updated.set(variantId, { ...existing, cogs: numValue })
      return updated
    })
  }

  const handleVatChange = (variantId: string, value: string) => {
    const numValue = parseFloat(value)
    setPendingChanges(prev => {
      const updated = new Map(prev)
      const existing = updated.get(variantId) || {}
      updated.set(variantId, { ...existing, vatRate: numValue })
      return updated
    })
  }

  const saveChanges = async (variantId: string) => {
    const changes = pendingChanges.get(variantId)
    if (!changes) return

    const product = products.find(p => p.variantId === variantId)
    if (!product) return

    setSaving(variantId)
    try {
      const res = await fetch('/api/cogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          variantId,
          cost: changes.cogs ?? product.cogs?.costPrice ?? 0,
          vatRate: changes.vatRate ?? product.vatRate,
        }),
      })

      if (res.ok) {
        // Update local state
        setProducts(prev => prev.map(p => {
          if (p.variantId === variantId) {
            return {
              ...p,
              cogs: { costPrice: changes.cogs ?? p.cogs?.costPrice ?? 0, source: 'MANUAL' },
              vatRate: changes.vatRate ?? p.vatRate,
              hasCogs: true,
            }
          }
          return p
        }))
        // Clear pending changes
        setPendingChanges(prev => {
          const updated = new Map(prev)
          updated.delete(variantId)
          return updated
        })
      }
    } catch (error) {
      console.error('Failed to save:', error)
    } finally {
      setSaving(null)
    }
  }

  const filteredProducts = products.filter(
    (p) =>
      p.productTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.sku && p.sku.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const totalInventoryValue = products.reduce((sum, p) => {
    const cogs = pendingChanges.get(p.variantId)?.cogs ?? p.cogs?.costPrice ?? 0
    return sum + cogs * p.inventoryQuantity
  }, 0)

  const totalRetailValue = products.reduce((sum, p) => sum + Number(p.price) * p.inventoryQuantity, 0)

  const productsWithCogs = products.filter(p => p.hasCogs || pendingChanges.has(p.variantId)).length

  const avgMargin = products.length > 0
    ? products.reduce((sum, p) => {
        const cogs = pendingChanges.get(p.variantId)?.cogs ?? p.cogs?.costPrice ?? 0
        const margin = Number(p.price) > 0 ? ((Number(p.price) - cogs) / Number(p.price)) * 100 : 0
        return sum + margin
      }, 0) / products.length
    : 0

  const getMargin = (price: number, cogs: number) => {
    return price > 0 ? ((price - cogs) / price) * 100 : 0
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">COGS Management</h1>
          <p className="text-slate-600">Manage Cost of Goods Sold and VAT for your products</p>
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
                  {productsWithCogs} / {products.length}
                </p>
              </div>
              <div className={`text-sm font-medium ${
                productsWithCogs === products.length ? 'text-green-500' : 'text-amber-500'
              }`}>
                {products.length > 0 ? Math.round((productsWithCogs / products.length) * 100) : 0}%
              </div>
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
              <CardDescription>Set and manage COGS and VAT for each product variant</CardDescription>
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
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No products found. Sync your store to import products.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead>VAT Rate</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Inventory Value</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => {
                  const changes = pendingChanges.get(product.variantId)
                  const currentCogs = changes?.cogs ?? product.cogs?.costPrice ?? 0
                  const currentVat = changes?.vatRate ?? product.vatRate ?? 25
                  const margin = getMargin(Number(product.price), currentCogs)
                  const hasChanges = !!changes

                  return (
                    <TableRow key={product.variantId}>
                      <TableCell className="font-medium">
                        <div>
                          {product.productTitle}
                          {product.variantTitle && product.variantTitle !== 'Default Title' && (
                            <span className="text-slate-500 text-sm ml-1">
                              - {product.variantTitle}
                            </span>
                          )}
                        </div>
                        {product.cogs?.source === 'SHOPIFY_COST' && (
                          <Badge variant="outline" className="text-xs mt-1">
                            From Shopify
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {product.sku && <Badge variant="outline">{product.sku}</Badge>}
                      </TableCell>
                      <TableCell className="text-right">{Number(product.price).toFixed(0)} kr</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={currentCogs}
                          onChange={(e) => handleCogsChange(product.variantId, e.target.value)}
                          className="w-24 text-right ml-auto"
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={currentVat.toString()}
                          onValueChange={(value) => handleVatChange(product.variantId, value)}
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue placeholder="Select VAT" />
                          </SelectTrigger>
                          <SelectContent>
                            {VAT_RATES.map(rate => (
                              <SelectItem key={rate.value} value={rate.value}>
                                {rate.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant={margin > 70 ? 'default' : margin > 50 ? 'secondary' : 'destructive'}
                        >
                          {margin.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{product.inventoryQuantity}</TableCell>
                      <TableCell className="text-right font-medium">
                        {(currentCogs * product.inventoryQuantity).toLocaleString('sv-SE')} kr
                      </TableCell>
                      <TableCell>
                        {hasChanges && (
                          <Button
                            size="sm"
                            onClick={() => saveChanges(product.variantId)}
                            disabled={saving === product.variantId}
                          >
                            {saving === product.variantId ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

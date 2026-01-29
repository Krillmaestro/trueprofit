'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Store, RefreshCw, Settings, Trash2, CheckCircle, XCircle } from 'lucide-react'

// Demo data
const demoStores = [
  {
    id: '1',
    name: 'My Shopify Store',
    domain: 'mystore.myshopify.com',
    currency: 'SEK',
    lastSync: '2025-01-28 14:32',
    syncStatus: 'success',
    products: 245,
    orders: 1247,
  },
]

export default function StoresPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [shopDomain, setShopDomain] = useState('')

  const handleConnect = () => {
    // In production, this would redirect to Shopify OAuth
    const redirectUrl = `/api/shopify/oauth?shop=${shopDomain}`
    console.log('Would redirect to:', redirectUrl)
    setDialogOpen(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Store Connections</h1>
          <p className="text-slate-600">Connect and manage your Shopify stores</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Connect Store
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect Shopify Store</DialogTitle>
              <DialogDescription>
                Enter your Shopify store domain to start the connection process.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="domain">Store Domain</Label>
                <div className="flex">
                  <Input
                    id="domain"
                    placeholder="mystore"
                    value={shopDomain}
                    onChange={(e) => setShopDomain(e.target.value)}
                    className="rounded-r-none"
                  />
                  <div className="flex items-center px-3 bg-slate-100 border border-l-0 border-slate-200 rounded-r-md text-slate-600 text-sm">
                    .myshopify.com
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConnect} disabled={!shopDomain}>
                Connect with Shopify
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {demoStores.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Store className="h-12 w-12 text-slate-400 mb-4" />
            <h3 className="text-lg font-semibold text-slate-800 mb-2">No stores connected</h3>
            <p className="text-slate-600 mb-4 text-center max-w-md">
              Connect your Shopify store to start tracking profits and managing your business.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Connect Your First Store
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {demoStores.map((store) => (
            <Card key={store.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <Store className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <CardTitle>{store.name}</CardTitle>
                      <CardDescription>{store.domain}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={store.syncStatus === 'success' ? 'default' : 'destructive'}>
                      {store.syncStatus === 'success' ? (
                        <CheckCircle className="w-3 h-3 mr-1" />
                      ) : (
                        <XCircle className="w-3 h-3 mr-1" />
                      )}
                      {store.syncStatus === 'success' ? 'Connected' : 'Error'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-slate-600">Products</p>
                    <p className="text-lg font-semibold">{store.products}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Orders</p>
                    <p className="text-lg font-semibold">{store.orders}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Currency</p>
                    <p className="text-lg font-semibold">{store.currency}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Last Sync</p>
                    <p className="text-lg font-semibold">{store.lastSync}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Sync Now
                  </Button>
                  <Button variant="outline" size="sm">
                    <Settings className="w-4 h-4 mr-2" />
                    Configure
                  </Button>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
                    <Trash2 className="w-4 h-4 mr-2" />
                    Disconnect
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

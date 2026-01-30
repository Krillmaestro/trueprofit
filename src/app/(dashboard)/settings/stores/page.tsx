'use client'

import { useState, useEffect } from 'react'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Store, RefreshCw, Trash2, CheckCircle, XCircle, Loader2, ExternalLink } from 'lucide-react'
import { EmptyState } from '@/components/EmptyState'

interface StoreData {
  id: string
  name: string | null
  shopifyDomain: string
  currency: string | null
  timezone: string | null
  isActive: boolean
  lastSyncAt: string | null
  createdAt: string
  productCount: number
  orderCount: number
}

export default function StoresPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [shopDomain, setShopDomain] = useState('')
  const [stores, setStores] = useState<StoreData[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState<StoreData | null>(null)
  const [connecting, setConnecting] = useState(false)

  // Fetch stores on mount
  useEffect(() => {
    fetchStores()
  }, [])

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/stores')
      if (res.ok) {
        const data = await res.json()
        setStores(data)
      }
    } catch (error) {
      console.error('Failed to fetch stores:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = () => {
    if (!shopDomain) return
    setConnecting(true)

    // Build the full domain
    const fullDomain = shopDomain.includes('.myshopify.com')
      ? shopDomain.replace('https://', '').replace('http://', '')
      : `${shopDomain}.myshopify.com`

    // Redirect to Shopify OAuth
    window.location.href = `/api/shopify/oauth?shop=${fullDomain}`
  }

  const handleSync = async (storeId: string) => {
    setSyncing(storeId)
    try {
      const res = await fetch('/api/shopify/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId, type: 'all' }),
      })

      if (res.ok) {
        // Refresh stores list
        await fetchStores()
      } else {
        const data = await res.json()
        alert(`Sync failed: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Sync failed:', error)
      alert('Sync failed. Please try again.')
    } finally {
      setSyncing(null)
    }
  }

  const handleDisconnect = async (store: StoreData) => {
    setDisconnecting(store.id)
    try {
      const res = await fetch(`/api/stores?id=${store.id}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        // Remove from list
        setStores(stores.filter(s => s.id !== store.id))
      } else {
        const data = await res.json()
        alert(`Failed to disconnect: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Disconnect failed:', error)
      alert('Failed to disconnect. Please try again.')
    } finally {
      setDisconnecting(null)
      setConfirmDisconnect(null)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Aldrig'
    return new Date(dateString).toLocaleString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-40" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Butikskopplingar</h1>
          <p className="text-slate-600">Koppla och hantera dina Shopify-butiker</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Koppla butik
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Koppla Shopify-butik</DialogTitle>
              <DialogDescription>
                Ange din Shopify-butiks domän för att starta kopplingen.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="domain">Butiksdomän</Label>
                <div className="flex">
                  <Input
                    id="domain"
                    placeholder="minbutik"
                    value={shopDomain}
                    onChange={(e) => setShopDomain(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                    className="rounded-r-none"
                  />
                  <div className="flex items-center px-3 bg-slate-100 border border-l-0 border-slate-200 rounded-r-md text-slate-600 text-sm">
                    .myshopify.com
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  T.ex. om din butik är &quot;minbutik.myshopify.com&quot;, skriv bara &quot;minbutik&quot;
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Avbryt
              </Button>
              <Button onClick={handleConnect} disabled={!shopDomain || connecting}>
                {connecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Kopplar...
                  </>
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Koppla med Shopify
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {stores.length === 0 ? (
        <EmptyState
          type="store"
          customPrimaryAction={{
            label: 'Koppla din första butik',
            onClick: () => setDialogOpen(true),
          }}
        />
      ) : (
        <div className="space-y-4">
          {stores.map((store) => (
            <Card key={store.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${store.isActive ? 'bg-green-100' : 'bg-slate-100'}`}>
                      <Store className={`h-6 w-6 ${store.isActive ? 'text-green-600' : 'text-slate-400'}`} />
                    </div>
                    <div>
                      <CardTitle>{store.name || store.shopifyDomain}</CardTitle>
                      <CardDescription>{store.shopifyDomain}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={store.isActive ? 'default' : 'secondary'}>
                      {store.isActive ? (
                        <>
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Ansluten
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3 mr-1" />
                          Inaktiv
                        </>
                      )}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-slate-600">Produkter</p>
                    <p className="text-lg font-semibold">{store.productCount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Ordrar</p>
                    <p className="text-lg font-semibold">{store.orderCount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Valuta</p>
                    <p className="text-lg font-semibold">{store.currency || 'Ej angiven'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-600">Senaste synk</p>
                    <p className="text-lg font-semibold">{formatDate(store.lastSyncAt)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSync(store.id)}
                    disabled={syncing === store.id || !store.isActive}
                  >
                    {syncing === store.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Synkar...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Synka nu
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setConfirmDisconnect(store)}
                    disabled={disconnecting === store.id}
                  >
                    {disconnecting === store.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Kopplar bort...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Koppla bort
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Confirm disconnect dialog */}
      <AlertDialog open={!!confirmDisconnect} onOpenChange={() => setConfirmDisconnect(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Koppla bort butik?</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill koppla bort <strong>{confirmDisconnect?.name || confirmDisconnect?.shopifyDomain}</strong>?
              <br /><br />
              Din data (ordrar, produkter) kommer att finnas kvar, men butiken kommer inte längre synkroniseras automatiskt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => confirmDisconnect && handleDisconnect(confirmDisconnect)}
            >
              Ja, koppla bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

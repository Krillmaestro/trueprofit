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
  const [syncStatus, setSyncStatus] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null)
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

  const handleSync = async (storeId: string, incremental: boolean = true) => {
    setSyncing(storeId)
    setSyncStatus({ message: 'Startar synkronisering...', type: 'info' })

    try {
      const res = await fetch('/api/shopify/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          type: 'all',
          background: true,
          incremental, // Only sync new data since last sync
        }),
      })

      const data = await res.json()

      if (res.ok && data.syncId) {
        setSyncStatus({
          message: 'Synkronisering startad! Du kan lämna sidan - syncen fortsätter i bakgrunden.',
          type: 'success'
        })

        // Poll for status updates
        pollSyncStatus(data.syncId, storeId)
      } else {
        setSyncStatus({
          message: `Sync failed: ${data.error || 'Unknown error'}`,
          type: 'error'
        })
        setSyncing(null)
      }
    } catch (error) {
      console.error('Sync failed:', error)
      setSyncStatus({
        message: 'Sync failed. Please try again.',
        type: 'error'
      })
      setSyncing(null)
    }
  }

  const pollSyncStatus = async (syncId: string, storeId: string) => {
    const maxAttempts = 120 // 10 minutes max (5 second intervals)
    let attempts = 0

    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/shopify/sync?syncId=${syncId}`)
        const data = await res.json()

        if (data.status === 'completed') {
          setSyncStatus({
            message: `Synkronisering klar! ${data.result?.message || ''}`,
            type: 'success'
          })
          setSyncing(null)
          await fetchStores() // Refresh data
          // Auto-hide success message after 5 seconds
          setTimeout(() => setSyncStatus(null), 5000)
          return
        }

        if (data.status === 'failed') {
          setSyncStatus({
            message: `Sync misslyckades: ${data.error || 'Unknown error'}`,
            type: 'error'
          })
          setSyncing(null)
          return
        }

        if (data.status === 'running') {
          setSyncStatus({
            message: data.progress || 'Synkroniserar...',
            type: 'info'
          })
        }

        // Continue polling
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 5000) // Check every 5 seconds
        } else {
          setSyncStatus({
            message: 'Synken tar lång tid. Kontrollera status senare.',
            type: 'info'
          })
          setSyncing(null)
        }
      } catch {
        // Network error, but sync may still be running
        attempts++
        if (attempts < maxAttempts) {
          setTimeout(checkStatus, 5000)
        }
      }
    }

    checkStatus()
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

      {/* Sync status banner */}
      {syncStatus && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          syncStatus.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' :
          syncStatus.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' :
          'bg-blue-50 text-blue-800 border border-blue-200'
        }`}>
          {syncStatus.type === 'info' && <Loader2 className="w-5 h-5 animate-spin" />}
          {syncStatus.type === 'success' && <CheckCircle className="w-5 h-5" />}
          {syncStatus.type === 'error' && <XCircle className="w-5 h-5" />}
          <span>{syncStatus.message}</span>
          {syncStatus.type !== 'info' && (
            <button
              onClick={() => setSyncStatus(null)}
              className="ml-auto text-sm underline hover:no-underline"
            >
              Stäng
            </button>
          )}
        </div>
      )}

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
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSync(store.id, true)}
                    disabled={syncing === store.id || !store.isActive}
                    title="Synkar endast nya/uppdaterade ordrar sedan förra synken"
                  >
                    {syncing === store.id ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Synkar...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Snabb synk
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSync(store.id, false)}
                    disabled={syncing === store.id || !store.isActive}
                    title="Synkar alla ordrar från 2026 (tar längre tid)"
                  >
                    Full synk
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

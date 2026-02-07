'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  History,
  Calendar,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Rocket,
  Store,
  Target,
  Sparkles,
  Zap,
} from 'lucide-react'

interface BulkSyncStatus {
  status: 'running' | 'completed' | 'failed'
  progress: string
  ordersProcessed: number
  totalEstimate: number
  startedAt: string
  error?: string
}

interface SyncResult {
  source: string
  type: 'shopify' | 'facebook' | 'google'
  success: boolean
  count: number
  error?: string
}

interface HistoricalSyncStatus {
  status: 'running' | 'completed' | 'failed'
  progress?: string
  results?: SyncResult[]
  error?: string
}

interface HistoricalSyncCardProps {
  className?: string
  compact?: boolean
  onSyncComplete?: () => void
}

export function HistoricalSyncCard({
  className,
  compact = false,
  onSyncComplete,
}: HistoricalSyncCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [startDate, setStartDate] = useState('2025-08-01')
  const [syncShopify, setSyncShopify] = useState(true)
  const [syncAds, setSyncAds] = useState(true)
  const [includeLineItems, setIncludeLineItems] = useState(true)
  const [useBulkSync, setUseBulkSync] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncId, setSyncId] = useState<string | null>(null)
  const [bulkStatus, setBulkStatus] = useState<BulkSyncStatus | null>(null)
  const [historicalStatus, setHistoricalStatus] = useState<HistoricalSyncStatus | null>(null)
  const [progress, setProgress] = useState(0)

  // Poll for bulk sync status
  useEffect(() => {
    if (!syncId || !syncing) return

    const interval = setInterval(async () => {
      try {
        const endpoint = useBulkSync ? '/api/sync/bulk' : '/api/sync/historical'
        const res = await fetch(`${endpoint}?syncId=${syncId}`)

        if (res.ok) {
          const data = await res.json()

          if (useBulkSync) {
            const status = data as BulkSyncStatus
            setBulkStatus(status)

            // Calculate progress based on orders processed
            if (status.totalEstimate > 0) {
              const pct = Math.min((status.ordersProcessed / status.totalEstimate) * 100, 95)
              setProgress(Math.max(pct, progress))
            }

            if (status.status === 'completed') {
              setSyncing(false)
              setProgress(100)
              onSyncComplete?.()
            } else if (status.status === 'failed') {
              setSyncing(false)
            }
          } else {
            const status = data as HistoricalSyncStatus
            setHistoricalStatus(status)

            if (status.status === 'completed') {
              setSyncing(false)
              setProgress(100)
              onSyncComplete?.()
            } else if (status.status === 'failed') {
              setSyncing(false)
            } else if (status.status === 'running') {
              setProgress((prev) => Math.min(prev + 2, 95))
            }
          }
        }
      } catch (error) {
        console.error('Failed to check sync status:', error)
      }
    }, 2000) // Poll every 2 seconds for real-time updates

    return () => clearInterval(interval)
  }, [syncId, syncing, useBulkSync, onSyncComplete, progress])

  const handleStartSync = async () => {
    setSyncing(true)
    setProgress(5)
    setBulkStatus(null)
    setHistoricalStatus(null)

    try {
      if (useBulkSync && syncShopify) {
        // Use the fast bulk sync endpoint
        const res = await fetch('/api/sync/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate,
            includeLineItems,
          }),
        })

        const data = await res.json()

        if (res.ok && data.syncId) {
          setSyncId(data.syncId)
          setBulkStatus({
            status: 'running',
            progress: data.message || 'Startar...',
            ordersProcessed: 0,
            totalEstimate: 0,
            startedAt: new Date().toISOString(),
          })
          setProgress(10)
        } else {
          setBulkStatus({
            status: 'failed',
            progress: 'Misslyckades',
            ordersProcessed: 0,
            totalEstimate: 0,
            startedAt: new Date().toISOString(),
            error: data.error || 'Failed to start sync',
          })
          setSyncing(false)
        }
      } else {
        // Use the historical sync endpoint
        const res = await fetch('/api/sync/historical', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDate,
            syncShopify,
            syncAds,
            background: true,
          }),
        })

        const data = await res.json()

        if (res.ok && data.syncId) {
          setSyncId(data.syncId)
          setHistoricalStatus({ status: 'running', progress: 'Startar...' })
          setProgress(10)
        } else {
          setHistoricalStatus({
            status: 'failed',
            error: data.error || 'Failed to start sync',
          })
          setSyncing(false)
        }
      }
    } catch (error) {
      console.error('Sync error:', error)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      if (useBulkSync) {
        setBulkStatus({
          status: 'failed',
          progress: 'Misslyckades',
          ordersProcessed: 0,
          totalEstimate: 0,
          startedAt: new Date().toISOString(),
          error: errorMsg,
        })
      } else {
        setHistoricalStatus({ status: 'failed', error: errorMsg })
      }
      setSyncing(false)
    }
  }

  const handleQuickSync = async (months: number) => {
    const date = new Date()
    date.setMonth(date.getMonth() - months)
    setStartDate(date.toISOString().split('T')[0])
    setDialogOpen(true)
  }

  const getTotalSynced = () => {
    if (bulkStatus) {
      return bulkStatus.ordersProcessed
    }
    if (historicalStatus?.results) {
      return historicalStatus.results.reduce((sum, r) => sum + (r.success ? r.count : 0), 0)
    }
    return 0
  }

  const isCompleted = () => {
    return bulkStatus?.status === 'completed' || historicalStatus?.status === 'completed'
  }

  const isFailed = () => {
    return bulkStatus?.status === 'failed' || historicalStatus?.status === 'failed'
  }

  const getError = () => {
    return bulkStatus?.error || historicalStatus?.error
  }

  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'shopify':
        return <Store className="w-4 h-4" />
      case 'facebook':
      case 'google':
        return <Target className="w-4 h-4" />
      default:
        return <History className="w-4 h-4" />
    }
  }

  if (compact) {
    return (
      <Card className={cn('border-dashed border-violet-200 bg-violet-50/50', className)}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-100">
                <History className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <h3 className="font-medium text-slate-800">Historisk data</h3>
                <p className="text-sm text-slate-500">Synka alla ordrar snabbt</p>
              </div>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-violet-300 text-violet-700 hover:bg-violet-100">
                  <Zap className="w-4 h-4 mr-2" />
                  Snabb-synk
                </Button>
              </DialogTrigger>
              <SyncDialogContent
                startDate={startDate}
                setStartDate={setStartDate}
                syncShopify={syncShopify}
                setSyncShopify={setSyncShopify}
                syncAds={syncAds}
                setSyncAds={setSyncAds}
                includeLineItems={includeLineItems}
                setIncludeLineItems={setIncludeLineItems}
                useBulkSync={useBulkSync}
                setUseBulkSync={setUseBulkSync}
                syncing={syncing}
                bulkStatus={bulkStatus}
                historicalStatus={historicalStatus}
                progress={progress}
                getTotalSynced={getTotalSynced}
                getSourceIcon={getSourceIcon}
                isCompleted={isCompleted}
                isFailed={isFailed}
                getError={getError}
                handleStartSync={handleStartSync}
                setDialogOpen={setDialogOpen}
              />
            </Dialog>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="bg-gradient-to-r from-violet-500 to-purple-600 p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-white/20">
            <Rocket className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Snabb Synkronisering</h2>
            <p className="text-violet-100">Importera tusentals ordrar på minuter</p>
          </div>
        </div>
      </div>

      <CardContent className="p-6">
        <div className="space-y-4">
          <p className="text-slate-600">
            Synka alla dina Shopify-ordrar snabbt. Vårt optimerade system kan hantera
            10,000+ ordrar och ger dig real-time progress.
          </p>

          {/* Quick sync buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickSync(6)}
              className="border-violet-200 hover:bg-violet-50"
            >
              <Sparkles className="w-4 h-4 mr-2 text-violet-500" />
              Senaste 6 månader
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStartDate('2025-08-01')
                setDialogOpen(true)
              }}
              className="border-violet-200 hover:bg-violet-50"
            >
              <Sparkles className="w-4 h-4 mr-2 text-violet-500" />
              Från augusti 2025
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickSync(12)}
              className="border-violet-200 hover:bg-violet-50"
            >
              <Sparkles className="w-4 h-4 mr-2 text-violet-500" />
              Senaste 12 månader
            </Button>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700">
                <Zap className="w-4 h-4 mr-2" />
                Starta synkronisering
              </Button>
            </DialogTrigger>
            <SyncDialogContent
              startDate={startDate}
              setStartDate={setStartDate}
              syncShopify={syncShopify}
              setSyncShopify={setSyncShopify}
              syncAds={syncAds}
              setSyncAds={setSyncAds}
              includeLineItems={includeLineItems}
              setIncludeLineItems={setIncludeLineItems}
              useBulkSync={useBulkSync}
              setUseBulkSync={setUseBulkSync}
              syncing={syncing}
              bulkStatus={bulkStatus}
              historicalStatus={historicalStatus}
              progress={progress}
              getTotalSynced={getTotalSynced}
              getSourceIcon={getSourceIcon}
              isCompleted={isCompleted}
              isFailed={isFailed}
              getError={getError}
              handleStartSync={handleStartSync}
              setDialogOpen={setDialogOpen}
            />
          </Dialog>

          {/* Recent sync status */}
          {(bulkStatus || historicalStatus) && !syncing && (
            <div className={cn(
              'p-4 rounded-lg border',
              isCompleted() ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            )}>
              <div className="flex items-center gap-2 mb-2">
                {isCompleted() ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <span className={cn(
                  'font-medium',
                  isCompleted() ? 'text-green-800' : 'text-red-800'
                )}>
                  {isCompleted() ? 'Synkronisering klar!' : 'Synkronisering misslyckades'}
                </span>
              </div>
              {isCompleted() && (
                <p className="text-sm text-green-700">
                  Synkade totalt <strong>{getTotalSynced().toLocaleString()}</strong> ordrar.
                </p>
              )}
              {isFailed() && getError() && (
                <p className="text-sm text-red-700">{getError()}</p>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Separate dialog content component for reuse
function SyncDialogContent({
  startDate,
  setStartDate,
  syncShopify,
  setSyncShopify,
  syncAds,
  setSyncAds,
  includeLineItems,
  setIncludeLineItems,
  useBulkSync,
  setUseBulkSync,
  syncing,
  bulkStatus,
  historicalStatus,
  progress,
  getTotalSynced,
  getSourceIcon,
  isCompleted,
  isFailed,
  getError,
  handleStartSync,
  setDialogOpen,
}: {
  startDate: string
  setStartDate: (date: string) => void
  syncShopify: boolean
  setSyncShopify: (value: boolean) => void
  syncAds: boolean
  setSyncAds: (value: boolean) => void
  includeLineItems: boolean
  setIncludeLineItems: (value: boolean) => void
  useBulkSync: boolean
  setUseBulkSync: (value: boolean) => void
  syncing: boolean
  bulkStatus: BulkSyncStatus | null
  historicalStatus: HistoricalSyncStatus | null
  progress: number
  getTotalSynced: () => number
  getSourceIcon: (type: string) => React.ReactNode
  isCompleted: () => boolean
  isFailed: () => boolean
  getError: () => string | undefined
  handleStartSync: () => void
  setDialogOpen: (open: boolean) => void
}) {
  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-violet-600" />
          Snabb Synkronisering
        </DialogTitle>
        <DialogDescription>
          Synka tusentals ordrar på bara några minuter med real-time progress.
        </DialogDescription>
      </DialogHeader>

      {syncing ? (
        <div className="py-6 space-y-4">
          <div className="text-center">
            <div className="relative w-20 h-20 mx-auto">
              <Loader2 className="w-20 h-20 text-violet-200 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-violet-600">
                  {Math.round(progress)}%
                </span>
              </div>
            </div>
            <p className="mt-4 font-medium text-slate-800">
              {bulkStatus?.progress || 'Synkroniserar...'}
            </p>
            {bulkStatus && (
              <p className="text-lg font-semibold text-violet-600 mt-2">
                {bulkStatus.ordersProcessed.toLocaleString()} ordrar
              </p>
            )}
          </div>

          <Progress value={progress} className="h-3" />

          <p className="text-center text-sm text-slate-500">
            Du kan lämna sidan - synken fortsätter i bakgrunden
          </p>
        </div>
      ) : isCompleted() ? (
        <div className="py-6 text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-green-600" />
          </div>
          <h3 className="mt-4 text-xl font-bold text-slate-800">Synkronisering klar!</h3>
          <p className="text-slate-600 mt-2">
            Synkade totalt <strong className="text-green-600">{getTotalSynced().toLocaleString()}</strong> ordrar.
          </p>

          {historicalStatus?.results && (
            <div className="mt-4 space-y-2 text-left">
              {historicalStatus.results.map((result, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg',
                    result.success ? 'bg-green-50' : 'bg-red-50'
                  )}
                >
                  <div className="flex items-center gap-2">
                    {getSourceIcon(result.type)}
                    <span className="text-sm font-medium">{result.source}</span>
                  </div>
                  {result.success ? (
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                      {result.count.toLocaleString()} poster
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">
                      Misslyckades
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}

          <Button
            className="mt-6 w-full bg-gradient-to-r from-green-500 to-emerald-600"
            onClick={() => {
              setDialogOpen(false)
              window.location.reload()
            }}
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Visa uppdaterad data
          </Button>
        </div>
      ) : isFailed() ? (
        <div className="py-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-800">Synkronisering misslyckades</h3>
          <p className="text-red-600 mt-2">{getError()}</p>
          <Button
            variant="outline"
            className="mt-6"
            onClick={() => setDialogOpen(false)}
          >
            Stäng
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-4 py-4">
            {/* Date picker */}
            <div className="space-y-2">
              <Label htmlFor="start-date" className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-500" />
                Startdatum
              </Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                max={new Date().toISOString().split('T')[0]}
              />
              <p className="text-xs text-slate-500">
                All data från detta datum och framåt kommer att synkas.
              </p>
            </div>

            {/* Quick date buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStartDate('2025-08-01')}
                className="text-xs bg-violet-50 border-violet-200"
              >
                <Sparkles className="w-3 h-3 mr-1 text-violet-500" />
                Aug 2025
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date()
                  d.setMonth(d.getMonth() - 6)
                  setStartDate(d.toISOString().split('T')[0])
                }}
                className="text-xs"
              >
                6 mån
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const d = new Date()
                  d.setFullYear(d.getFullYear() - 1)
                  setStartDate(d.toISOString().split('T')[0])
                }}
                className="text-xs"
              >
                1 år
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStartDate('2024-01-01')}
                className="text-xs"
              >
                Jan 2024
              </Button>
            </div>

            {/* Sync mode toggle */}
            <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-lg border border-violet-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="w-5 h-5 text-violet-600" />
                  <div>
                    <Label className="font-medium">Turbo-läge</Label>
                    <p className="text-xs text-slate-500">Optimerad för 10,000+ ordrar</p>
                  </div>
                </div>
                <Switch
                  checked={useBulkSync}
                  onCheckedChange={setUseBulkSync}
                />
              </div>
            </div>

            {/* Sync options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Store className="w-5 h-5 text-green-600" />
                  <div>
                    <Label className="font-medium">Shopify-ordrar</Label>
                    <p className="text-xs text-slate-500">Orderhistorik och kundinformation</p>
                  </div>
                </div>
                <Switch
                  checked={syncShopify}
                  onCheckedChange={setSyncShopify}
                />
              </div>

              {useBulkSync && syncShopify && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg ml-4">
                  <div>
                    <Label className="font-medium text-sm">Inkludera line items</Label>
                    <p className="text-xs text-slate-500">Behövs för COGS-beräkning</p>
                  </div>
                  <Switch
                    checked={includeLineItems}
                    onCheckedChange={setIncludeLineItems}
                  />
                </div>
              )}

              {!useBulkSync && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Target className="w-5 h-5 text-blue-600" />
                    <div>
                      <Label className="font-medium">Annonsdata</Label>
                      <p className="text-xs text-slate-500">Facebook & Google Ads</p>
                    </div>
                  </div>
                  <Switch
                    checked={syncAds}
                    onCheckedChange={setSyncAds}
                  />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                {useBulkSync ? (
                  <>
                    <strong>Turbo-läge:</strong> Optimerat för stora datamängder.
                    12,000 ordrar tar ca 5-10 minuter.
                  </>
                ) : (
                  <>
                    <strong>Standard-läge:</strong> Synkar ordrar och annonsdata.
                    Kan ta längre tid för stora datamängder.
                  </>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Avbryt
            </Button>
            <Button
              onClick={handleStartSync}
              disabled={!syncShopify && !syncAds}
              className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
            >
              <Rocket className="w-4 h-4 mr-2" />
              Starta synk
            </Button>
          </DialogFooter>
        </>
      )}
    </DialogContent>
  )
}

// Export a minimal "Sync Now" button variant
export function HistoricalSyncButton({ className }: { className?: string }) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('border-violet-300 text-violet-700 hover:bg-violet-50', className)}
        >
          <Zap className="w-4 h-4 mr-2" />
          Snabb-synk
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <HistoricalSyncCard compact={false} />
      </DialogContent>
    </Dialog>
  )
}

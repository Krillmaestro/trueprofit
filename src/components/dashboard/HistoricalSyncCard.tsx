'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
} from 'lucide-react'

interface SyncResult {
  source: string
  type: 'shopify' | 'facebook' | 'google'
  success: boolean
  count: number
  error?: string
}

interface SyncStatus {
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
  const [startDate, setStartDate] = useState('2024-08-01')
  const [syncShopify, setSyncShopify] = useState(true)
  const [syncAds, setSyncAds] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncId, setSyncId] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [progress, setProgress] = useState(0)

  // Poll for sync status
  useEffect(() => {
    if (!syncId || !syncing) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sync/historical?syncId=${syncId}`)
        if (res.ok) {
          const data: SyncStatus = await res.json()
          setSyncStatus(data)

          if (data.status === 'completed') {
            setSyncing(false)
            setProgress(100)
            onSyncComplete?.()
          } else if (data.status === 'failed') {
            setSyncing(false)
          } else if (data.status === 'running') {
            // Estimate progress based on time (rough estimate)
            setProgress((prev) => Math.min(prev + 2, 95))
          }
        }
      } catch (error) {
        console.error('Failed to check sync status:', error)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [syncId, syncing, onSyncComplete])

  const handleStartSync = async () => {
    setSyncing(true)
    setProgress(5)
    setSyncStatus({ status: 'running', progress: 'Startar...' })

    try {
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
        setProgress(10)
      } else {
        setSyncStatus({
          status: 'failed',
          error: data.error || 'Failed to start sync',
        })
        setSyncing(false)
      }
    } catch (error) {
      console.error('Sync error:', error)
      setSyncStatus({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
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
    if (!syncStatus?.results) return 0
    return syncStatus.results.reduce((sum, r) => sum + (r.success ? r.count : 0), 0)
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
                <p className="text-sm text-slate-500">Synka äldre ordrar och annonsdata</p>
              </div>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="border-violet-300 text-violet-700 hover:bg-violet-100">
                  <History className="w-4 h-4 mr-2" />
                  Synka historik
                </Button>
              </DialogTrigger>
              <SyncDialogContent
                startDate={startDate}
                setStartDate={setStartDate}
                syncShopify={syncShopify}
                setSyncShopify={setSyncShopify}
                syncAds={syncAds}
                setSyncAds={setSyncAds}
                syncing={syncing}
                syncStatus={syncStatus}
                progress={progress}
                getTotalSynced={getTotalSynced}
                getSourceIcon={getSourceIcon}
                handleStartSync={handleStartSync}
                handleQuickSync={handleQuickSync}
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
            <h2 className="text-xl font-bold">Historisk Synkronisering</h2>
            <p className="text-violet-100">Importera data för bättre analys</p>
          </div>
        </div>
      </div>

      <CardContent className="p-6">
        <div className="space-y-4">
          <p className="text-slate-600">
            Synka historisk orderdata och annonsdata för att få bättre insikter om din
            LTV/CAC, break-even ROAS och trender över tid.
          </p>

          {/* Quick sync buttons */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleQuickSync(3)}
              className="border-violet-200 hover:bg-violet-50"
            >
              <Sparkles className="w-4 h-4 mr-2 text-violet-500" />
              Senaste 3 månader
            </Button>
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
                <History className="w-4 h-4 mr-2" />
                Anpassad historisk synk
              </Button>
            </DialogTrigger>
            <SyncDialogContent
              startDate={startDate}
              setStartDate={setStartDate}
              syncShopify={syncShopify}
              setSyncShopify={setSyncShopify}
              syncAds={syncAds}
              setSyncAds={setSyncAds}
              syncing={syncing}
              syncStatus={syncStatus}
              progress={progress}
              getTotalSynced={getTotalSynced}
              getSourceIcon={getSourceIcon}
              handleStartSync={handleStartSync}
              handleQuickSync={handleQuickSync}
              setDialogOpen={setDialogOpen}
            />
          </Dialog>

          {/* Recent sync status */}
          {syncStatus && syncStatus.status !== 'running' && (
            <div className={cn(
              'p-4 rounded-lg border',
              syncStatus.status === 'completed' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            )}>
              <div className="flex items-center gap-2 mb-2">
                {syncStatus.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                <span className={cn(
                  'font-medium',
                  syncStatus.status === 'completed' ? 'text-green-800' : 'text-red-800'
                )}>
                  {syncStatus.status === 'completed' ? 'Synkronisering klar!' : 'Synkronisering misslyckades'}
                </span>
              </div>
              {syncStatus.status === 'completed' && syncStatus.results && (
                <p className="text-sm text-green-700">
                  Synkade totalt {getTotalSynced()} poster från {syncStatus.results.filter(r => r.success).length} källor.
                </p>
              )}
              {syncStatus.status === 'failed' && syncStatus.error && (
                <p className="text-sm text-red-700">{syncStatus.error}</p>
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
  syncing,
  syncStatus,
  progress,
  getTotalSynced,
  getSourceIcon,
  handleStartSync,
  handleQuickSync,
  setDialogOpen,
}: {
  startDate: string
  setStartDate: (date: string) => void
  syncShopify: boolean
  setSyncShopify: (value: boolean) => void
  syncAds: boolean
  setSyncAds: (value: boolean) => void
  syncing: boolean
  syncStatus: SyncStatus | null
  progress: number
  getTotalSynced: () => number
  getSourceIcon: (type: string) => React.ReactNode
  handleStartSync: () => void
  handleQuickSync: (months: number) => void
  setDialogOpen: (open: boolean) => void
}) {
  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <History className="w-5 h-5 text-violet-600" />
          Historisk Synkronisering
        </DialogTitle>
        <DialogDescription>
          Synka orderdata och annonsdata från ett specifikt datum för bättre analys.
        </DialogDescription>
      </DialogHeader>

      {syncing ? (
        <div className="py-6 space-y-4">
          <div className="text-center">
            <Loader2 className="w-12 h-12 mx-auto text-violet-500 animate-spin" />
            <p className="mt-4 font-medium text-slate-800">Synkroniserar...</p>
            <p className="text-sm text-slate-500">{syncStatus?.progress || 'Vänta medan vi hämtar din data'}</p>
          </div>

          <Progress value={progress} className="h-2" />

          {syncStatus?.status === 'completed' && syncStatus.results && (
            <div className="space-y-2 mt-4">
              {syncStatus.results.map((result, idx) => (
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
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <>
                        <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">
                          {result.count} poster
                        </Badge>
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-red-600">{result.error}</span>
                        <XCircle className="w-4 h-4 text-red-500" />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : syncStatus?.status === 'completed' ? (
        <div className="py-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-800">Synkronisering klar!</h3>
          <p className="text-slate-600 mt-2">
            Synkade totalt <strong>{getTotalSynced()}</strong> poster.
          </p>

          {syncStatus.results && (
            <div className="mt-4 space-y-2 text-left">
              {syncStatus.results.map((result, idx) => (
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
                      {result.count} poster
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
            className="mt-6 w-full"
            onClick={() => setDialogOpen(false)}
          >
            Stäng
          </Button>
        </div>
      ) : syncStatus?.status === 'failed' ? (
        <div className="py-6 text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-800">Synkronisering misslyckades</h3>
          <p className="text-red-600 mt-2">{syncStatus.error}</p>
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
                onClick={() => {
                  const d = new Date()
                  d.setMonth(d.getMonth() - 3)
                  setStartDate(d.toISOString().split('T')[0])
                }}
                className="text-xs"
              >
                3 mån
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
                onClick={() => setStartDate('2024-08-01')}
                className="text-xs"
              >
                Aug 2024
              </Button>
            </div>

            {/* Sync options */}
            <div className="space-y-3 pt-2">
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
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <strong>OBS:</strong> Historisk synkronisering kan ta flera minuter beroende på datamängd.
                Du kan lämna sidan – synken fortsätter i bakgrunden.
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
              Starta synkronisering
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
          <History className="w-4 h-4 mr-2" />
          Synka historik
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <HistoricalSyncCard compact={false} />
      </DialogContent>
    </Dialog>
  )
}

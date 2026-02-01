'use client'

import { useState } from 'react'
import { RefreshCw, Check, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface SyncResult {
  platform: string
  success: boolean
  count: number
  error?: string
}

interface SyncResponse {
  success: boolean
  message: string
  results: SyncResult[]
  summary: {
    total: number
    successful: number
    failed: number
    itemsSynced: number
  }
}

interface SyncButtonProps {
  onSyncComplete?: () => void
  dateFrom?: string
  dateTo?: string
}

export function SyncButton({ onSyncComplete, dateFrom, dateTo }: SyncButtonProps) {
  const [syncing, setSyncing] = useState(false)
  const [lastSyncResult, setLastSyncResult] = useState<SyncResponse | null>(null)
  const [showResult, setShowResult] = useState(false)

  const handleSync = async () => {
    setSyncing(true)
    setShowResult(false)

    try {
      const response = await fetch('/api/sync/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateFrom, dateTo }),
      })

      const data: SyncResponse = await response.json()
      setLastSyncResult(data)
      setShowResult(true)

      // Hide result after 5 seconds
      setTimeout(() => setShowResult(false), 5000)

      // Callback to refresh dashboard data
      if (onSyncComplete) {
        onSyncComplete()
      }
    } catch (error) {
      console.error('Sync failed:', error)
      setLastSyncResult({
        success: false,
        message: 'Synkronisering misslyckades',
        results: [],
        summary: { total: 0, successful: 0, failed: 1, itemsSynced: 0 },
      })
      setShowResult(true)
    } finally {
      setSyncing(false)
    }
  }

  const getStatusIcon = () => {
    if (syncing) {
      return <Loader2 className="h-4 w-4 animate-spin" />
    }
    if (showResult && lastSyncResult) {
      if (lastSyncResult.summary.failed === 0) {
        return <Check className="h-4 w-4 text-emerald-500" />
      }
      if (lastSyncResult.summary.successful > 0) {
        return <AlertCircle className="h-4 w-4 text-amber-500" />
      }
      return <AlertCircle className="h-4 w-4 text-red-500" />
    }
    return <RefreshCw className="h-4 w-4" />
  }

  const getButtonText = () => {
    if (syncing) return 'Synkar...'
    if (showResult && lastSyncResult) {
      if (lastSyncResult.summary.failed === 0) {
        return `Synkat ${lastSyncResult.summary.itemsSynced} poster`
      }
      return `${lastSyncResult.summary.successful}/${lastSyncResult.summary.total} lyckades`
    }
    return 'Synka allt'
  }

  const getButtonVariant = () => {
    if (showResult && lastSyncResult) {
      if (lastSyncResult.summary.failed === 0) return 'outline'
      if (lastSyncResult.summary.successful > 0) return 'outline'
      return 'destructive'
    }
    return 'outline'
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={getButtonVariant()}
            size="sm"
            onClick={handleSync}
            disabled={syncing}
            className={`gap-2 transition-all border-slate-300 text-slate-700 hover:bg-slate-100 ${
              showResult && lastSyncResult?.summary.failed === 0
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : ''
            }`}
          >
            {getStatusIcon()}
            <span className="hidden sm:inline">{getButtonText()}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          {syncing ? (
            <p>Synkroniserar Shopify, Facebook Ads och Google Ads...</p>
          ) : showResult && lastSyncResult ? (
            <div className="space-y-1">
              <p className="font-medium">{lastSyncResult.message}</p>
              {lastSyncResult.results.length > 0 && (
                <ul className="text-xs space-y-0.5">
                  {lastSyncResult.results.map((r, i) => (
                    <li key={i} className="flex items-center gap-1">
                      {r.success ? (
                        <Check className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-3 w-3 text-red-500" />
                      )}
                      <span>{r.platform}: {r.success ? `${r.count} poster` : r.error}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p>Synka senaste data från alla källor</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

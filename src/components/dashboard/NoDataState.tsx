'use client'

import { useState } from 'react'
import { GlowCard } from './GlowCard'
import { Button } from '@/components/ui/button'
import {
  RefreshCw,
  Store,
  Calendar,
  ArrowRight,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import Link from 'next/link'

interface NoDataStateProps {
  hasStore: boolean
  onSync?: () => void
  syncing?: boolean
  dateRange?: {
    startDate: Date
    endDate: Date
  }
}

export function NoDataState({
  hasStore,
  onSync,
  syncing,
  dateRange,
}: NoDataStateProps) {
  if (!hasStore) {
    return (
      <GlowCard className="p-12" glowColor="blue">
        <div className="text-center max-w-md mx-auto">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Store className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-3">
            Koppla din Shopify-butik
          </h2>
          <p className="text-slate-500 mb-6">
            För att se din vinstdata behöver du först koppla din Shopify-butik.
            Det tar bara några sekunder.
          </p>
          <Link href="/settings/stores">
            <Button className="bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500">
              <Store className="w-4 h-4 mr-2" />
              Koppla butik
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </GlowCard>
    )
  }

  return (
    <GlowCard className="p-12" glowColor="amber">
      <div className="text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Calendar className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-3">
          Ingen data för vald period
        </h2>
        <p className="text-slate-500 mb-2">
          Det finns inga ordrar för den valda tidsperioden.
        </p>
        {dateRange && (
          <p className="text-sm text-slate-400 mb-6">
            {dateRange.startDate.toLocaleDateString('sv-SE')} - {dateRange.endDate.toLocaleDateString('sv-SE')}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onSync && (
            <Button
              onClick={onSync}
              disabled={syncing}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400"
            >
              {syncing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Synkar...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Synka data
                </>
              )}
            </Button>
          )}
        </div>

        <p className="text-xs text-slate-400 mt-6">
          Tips: Välj ett annat datumintervall eller synka för att hämta senaste data.
        </p>
      </div>
    </GlowCard>
  )
}

'use client'

/**
 * Loading State Components
 * Skeleton loaders and loading indicators
 */

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ===========================================
// SKELETON BASE
// ===========================================

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-slate-200',
        className
      )}
    />
  )
}

// ===========================================
// CARD SKELETON
// ===========================================

interface CardSkeletonProps {
  compact?: boolean
  className?: string
}

export function CardSkeleton({ compact = false, className }: CardSkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200 bg-white',
        compact ? 'p-4' : 'p-6',
        className
      )}
    >
      <div className="space-y-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-8 w-2/3" />
        {!compact && <Skeleton className="h-4 w-1/4" />}
      </div>
    </div>
  )
}

// ===========================================
// METRIC CARD SKELETON
// ===========================================

export function MetricCardSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="space-y-3">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-28" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded-full" />
          <Skeleton className="h-3 w-12" />
        </div>
      </div>
    </div>
  )
}

// ===========================================
// CHART SKELETON
// ===========================================

export function ChartSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="h-64 flex items-end justify-around gap-2 pt-8">
          {[40, 65, 45, 80, 55, 70, 50].map((height, i) => (
            <div
              key={i}
              className="w-8 rounded-t bg-slate-200 animate-pulse"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ===========================================
// TABLE SKELETON
// ===========================================

interface TableSkeletonProps {
  rows?: number
  columns?: number
}

export function TableSkeleton({ rows = 5, columns = 4 }: TableSkeletonProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: columns }).map((_, i) => (
            <div
              key={i}
              className="h-4 bg-slate-200 animate-pulse rounded"
              style={{ width: `${100 / columns}%` }}
            />
          ))}
        </div>
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="border-b border-slate-100 last:border-0 px-4 py-3"
        >
          <div className="flex gap-4">
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div
                key={colIndex}
                className="h-4 bg-slate-200 animate-pulse rounded"
                style={{ width: `${100 / columns}%` }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ===========================================
// DASHBOARD SKELETON
// ===========================================

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-10 w-40" />
        </div>
      </div>

      {/* Hero Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      {/* Table */}
      <TableSkeleton rows={5} columns={5} />
    </div>
  )
}

// ===========================================
// P&L SKELETON
// ===========================================

export function PnLSkeleton() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-28" />
        </div>
      </div>

      {/* P&L Table */}
      <div className="rounded-lg border border-slate-200 bg-white">
        {/* Sections */}
        {[1, 2, 3].map((section) => (
          <div key={section}>
            <div className="border-b border-slate-200 bg-slate-50 px-6 py-3">
              <Skeleton className="h-5 w-32" />
            </div>
            {[1, 2, 3].map((row) => (
              <div key={row} className="border-b border-slate-100 px-6 py-3">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ===========================================
// SPINNER LOADING
// ===========================================

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }

  return (
    <Loader2
      className={cn(
        'animate-spin text-slate-400',
        sizeClasses[size],
        className
      )}
    />
  )
}

// ===========================================
// FULL PAGE LOADING
// ===========================================

interface LoadingStateProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingState({
  message = 'Laddar...',
  size = 'md',
}: LoadingStateProps) {
  const sizeClasses = {
    sm: 'min-h-[100px]',
    md: 'min-h-[200px]',
    lg: 'min-h-[400px]',
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4',
        sizeClasses[size]
      )}
      role="status"
      aria-live="polite"
    >
      <Spinner size={size} />
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  )
}

// ===========================================
// INLINE LOADING
// ===========================================

interface InlineLoadingProps {
  text?: string
}

export function InlineLoading({ text = 'Laddar' }: InlineLoadingProps) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
      <Spinner size="sm" />
      <span>{text}...</span>
    </span>
  )
}

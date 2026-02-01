'use client'

import { useState, useEffect, useCallback, useReducer } from 'react'
import { getDefaultDateRange } from '@/components/dashboard/DateRangePicker'
import type { DateRange as DateRangeValue } from '@/components/dashboard/DateRangePicker'
import { getPreviousPeriod } from '@/components/dashboard/ComparisonToggle'

// ===========================================
// TYPES
// ===========================================

export interface DashboardSummary {
  revenue: number
  revenueExVat?: number
  netRevenue?: number
  tax?: number
  costs: number
  profit: number
  margin: number
  grossMargin: number
  orders: number
  avgOrderValue: number
}

export interface RevenueBreakdown {
  gross: number
  discounts: number
  refunds: number
  shipping: number
  tax: number
  exVat?: number
  net: number
}

export interface CostsBreakdown {
  vat?: number
  cogs: number
  shipping: number
  shippingCost?: number
  fees: number
  adSpend: number
  fixed: number
  variable: number
  salaries: number
  recurring: number
  oneTime: number
  total: number
  totalWithVat?: number
}

export interface ProfitBreakdown {
  gross: number
  operating: number
  net: number
}

export interface DailyChartData {
  date: string
  revenue: number
  shipping: number
  tax: number
  discounts: number
  refunds: number
  orders: number
}

export interface AdsData {
  spend: number
  revenue: number
  roas: number
  breakEvenRoas?: number
  isAdsProfitable?: boolean
  impressions: number
  clicks: number
  conversions: number
  hasData?: boolean
}

export interface DataQuality {
  totalLineItems: number
  unmatchedLineItems: number
  cogsCompleteness: number
  cogsWarning?: string | null
  adsWarning?: string | null
}

export interface DashboardData {
  summary: DashboardSummary
  breakdown: {
    revenue: RevenueBreakdown
    costs: CostsBreakdown
    profit: ProfitBreakdown
  }
  chartData: {
    daily: DailyChartData[]
    costBreakdown: Array<{
      name: string
      value: number
      color: string
    }>
  }
  ads: AdsData
  dataQuality: DataQuality
}

export interface TopProduct {
  id: string
  name: string
  sku: string
  revenue: number
  profit: number
  margin: number
  orders: number
  trend: 'up' | 'down' | 'stable'
}

// ===========================================
// STATE MANAGEMENT
// ===========================================

type DashboardState = {
  loading: boolean
  error: string | null
  data: DashboardData | null
  previousData: DashboardData | null
  topProducts: TopProduct[]
  topProductsLoading: boolean
  hasStore: boolean
  syncing: boolean
}

type DashboardAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; payload: DashboardData }
  | { type: 'FETCH_ERROR'; payload: string }
  | { type: 'SET_PREVIOUS_DATA'; payload: DashboardData | null }
  | { type: 'SET_TOP_PRODUCTS'; payload: TopProduct[] }
  | { type: 'SET_TOP_PRODUCTS_LOADING'; payload: boolean }
  | { type: 'SET_HAS_STORE'; payload: boolean }
  | { type: 'SET_SYNCING'; payload: boolean }
  | { type: 'RESET_ERROR' }

const initialState: DashboardState = {
  loading: true,
  error: null,
  data: null,
  previousData: null,
  topProducts: [],
  topProductsLoading: true,
  hasStore: true,
  syncing: false,
}

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'FETCH_START':
      return { ...state, loading: true, error: null }
    case 'FETCH_SUCCESS':
      return { ...state, loading: false, data: action.payload, error: null }
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.payload, data: null }
    case 'SET_PREVIOUS_DATA':
      return { ...state, previousData: action.payload }
    case 'SET_TOP_PRODUCTS':
      return { ...state, topProducts: action.payload }
    case 'SET_TOP_PRODUCTS_LOADING':
      return { ...state, topProductsLoading: action.payload }
    case 'SET_HAS_STORE':
      return { ...state, hasStore: action.payload }
    case 'SET_SYNCING':
      return { ...state, syncing: action.payload }
    case 'RESET_ERROR':
      return { ...state, error: null }
    default:
      return state
  }
}

// ===========================================
// HOOK
// ===========================================

interface UseDashboardDataOptions {
  initialDateRange?: DateRangeValue
  enableComparison?: boolean
}

export function useDashboardData(options: UseDashboardDataOptions = {}) {
  const { initialDateRange, enableComparison = false } = options

  // Date range state (kept separate for UI control)
  const [dateRange, setDateRange] = useState<DateRangeValue>(
    initialDateRange || getDefaultDateRange()
  )
  const [comparisonEnabled, setComparisonEnabled] = useState(enableComparison)

  // Main state using reducer for complex state management
  const [state, dispatch] = useReducer(dashboardReducer, initialState)

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    dispatch({ type: 'FETCH_START' })

    try {
      const params = new URLSearchParams()
      if (dateRange.startDate) {
        params.set('startDate', dateRange.startDate.toISOString())
      }
      if (dateRange.endDate) {
        params.set('endDate', dateRange.endDate.toISOString())
      }

      const response = await fetch(`/api/dashboard/summary?${params.toString()}`)

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data')
      }

      const result = await response.json()
      dispatch({ type: 'FETCH_SUCCESS', payload: result })

      // Check if store exists when no orders
      if (result.summary.orders === 0) {
        const storeRes = await fetch('/api/stores')
        if (storeRes.ok) {
          const storeData = await storeRes.json()
          dispatch({
            type: 'SET_HAS_STORE',
            payload: storeData.stores && storeData.stores.length > 0,
          })
        }
      } else {
        dispatch({ type: 'SET_HAS_STORE', payload: true })
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      dispatch({ type: 'FETCH_ERROR', payload: 'Kunde inte ladda data. Forsok igen.' })
    }
  }, [dateRange])

  // Fetch top products
  const fetchTopProducts = useCallback(async () => {
    if (!state.data || state.data.summary.orders === 0) {
      dispatch({ type: 'SET_TOP_PRODUCTS', payload: [] })
      dispatch({ type: 'SET_TOP_PRODUCTS_LOADING', payload: false })
      return
    }

    dispatch({ type: 'SET_TOP_PRODUCTS_LOADING', payload: true })

    try {
      const params = new URLSearchParams()
      if (dateRange.startDate) {
        params.set('startDate', dateRange.startDate.toISOString())
      }
      if (dateRange.endDate) {
        params.set('endDate', dateRange.endDate.toISOString())
      }

      const response = await fetch(`/api/dashboard/top-products?${params.toString()}`)
      if (response.ok) {
        const result = await response.json()
        dispatch({ type: 'SET_TOP_PRODUCTS', payload: result.products || [] })
      } else {
        dispatch({ type: 'SET_TOP_PRODUCTS', payload: [] })
      }
    } catch {
      dispatch({ type: 'SET_TOP_PRODUCTS', payload: [] })
    } finally {
      dispatch({ type: 'SET_TOP_PRODUCTS_LOADING', payload: false })
    }
  }, [dateRange, state.data])

  // Fetch comparison period data
  const fetchPreviousPeriod = useCallback(async () => {
    if (!comparisonEnabled || !state.data) {
      dispatch({ type: 'SET_PREVIOUS_DATA', payload: null })
      return
    }

    const previous = getPreviousPeriod(dateRange)

    try {
      const params = new URLSearchParams()
      params.set('startDate', previous.startDate.toISOString())
      params.set('endDate', previous.endDate.toISOString())

      const response = await fetch(`/api/dashboard/summary?${params.toString()}`)
      if (response.ok) {
        const result = await response.json()
        dispatch({ type: 'SET_PREVIOUS_DATA', payload: result })
      }
    } catch {
      dispatch({ type: 'SET_PREVIOUS_DATA', payload: null })
    }
  }, [comparisonEnabled, dateRange, state.data])

  // Sync data handler
  const handleSync = useCallback(async () => {
    dispatch({ type: 'SET_SYNCING', payload: true })
    try {
      await fetch('/api/sync/all', { method: 'POST' })
      await fetchDashboardData()
    } finally {
      dispatch({ type: 'SET_SYNCING', payload: false })
    }
  }, [fetchDashboardData])

  // Reset error
  const resetError = useCallback(() => {
    dispatch({ type: 'RESET_ERROR' })
  }, [])

  // Effects
  useEffect(() => {
    fetchDashboardData()
  }, [fetchDashboardData])

  useEffect(() => {
    fetchTopProducts()
  }, [fetchTopProducts])

  useEffect(() => {
    fetchPreviousPeriod()
  }, [fetchPreviousPeriod])

  // Computed values
  const previousPeriod = getPreviousPeriod(dateRange)

  // Generate trend data for sparklines
  const generateTrendData = useCallback((base: number, variance: number, length: number) => {
    const data = []
    let current = base
    for (let i = 0; i < length; i++) {
      current = current + (Math.random() - 0.45) * variance
      data.push(Math.max(0, current))
    }
    return data
  }, [])

  return {
    // State
    ...state,
    dateRange,
    comparisonEnabled,
    previousPeriod,

    // Actions
    setDateRange,
    setComparisonEnabled,
    fetchDashboardData,
    handleSync,
    resetError,

    // Utilities
    generateTrendData,
  }
}

// ===========================================
// EXPORTS
// ===========================================

export type { DateRangeValue }

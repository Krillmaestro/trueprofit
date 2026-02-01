'use client'

import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  ReactNode,
} from 'react'

// ===========================================
// TYPES
// ===========================================

export interface Store {
  id: string
  name: string
  domain: string
  platform: 'shopify' | 'woocommerce' | 'other'
  currency: string
  isActive: boolean
  lastSyncAt: string | null
  createdAt: string
}

export interface StoreSettings {
  defaultCurrency: string
  vatRate: number
  timezone: string
  dateFormat: string
  locale: string
}

interface StoreState {
  stores: Store[]
  activeStore: Store | null
  settings: StoreSettings
  loading: boolean
  error: string | null
  initialized: boolean
}

type StoreAction =
  | { type: 'SET_STORES'; payload: Store[] }
  | { type: 'SET_ACTIVE_STORE'; payload: Store | null }
  | { type: 'SET_SETTINGS'; payload: Partial<StoreSettings> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_INITIALIZED'; payload: boolean }
  | { type: 'UPDATE_STORE'; payload: Store }
  | { type: 'REMOVE_STORE'; payload: string }

// ===========================================
// DEFAULT VALUES
// ===========================================

const defaultSettings: StoreSettings = {
  defaultCurrency: 'SEK',
  vatRate: 25,
  timezone: 'Europe/Stockholm',
  dateFormat: 'yyyy-MM-dd',
  locale: 'sv-SE',
}

const initialState: StoreState = {
  stores: [],
  activeStore: null,
  settings: defaultSettings,
  loading: true,
  error: null,
  initialized: false,
}

// ===========================================
// REDUCER
// ===========================================

function storeReducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'SET_STORES':
      return {
        ...state,
        stores: action.payload,
        // Auto-select first store if none active
        activeStore: state.activeStore || action.payload[0] || null,
      }

    case 'SET_ACTIVE_STORE':
      return { ...state, activeStore: action.payload }

    case 'SET_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      }

    case 'SET_LOADING':
      return { ...state, loading: action.payload }

    case 'SET_ERROR':
      return { ...state, error: action.payload }

    case 'SET_INITIALIZED':
      return { ...state, initialized: action.payload }

    case 'UPDATE_STORE':
      return {
        ...state,
        stores: state.stores.map((store) =>
          store.id === action.payload.id ? action.payload : store
        ),
        activeStore:
          state.activeStore?.id === action.payload.id
            ? action.payload
            : state.activeStore,
      }

    case 'REMOVE_STORE':
      const filteredStores = state.stores.filter(
        (store) => store.id !== action.payload
      )
      return {
        ...state,
        stores: filteredStores,
        activeStore:
          state.activeStore?.id === action.payload
            ? filteredStores[0] || null
            : state.activeStore,
      }

    default:
      return state
  }
}

// ===========================================
// CONTEXT
// ===========================================

interface StoreContextValue extends StoreState {
  // Store actions
  setActiveStore: (store: Store | null) => void
  refreshStores: () => Promise<void>
  addStore: (store: Store) => void
  updateStore: (store: Store) => void
  removeStore: (storeId: string) => void

  // Settings actions
  updateSettings: (settings: Partial<StoreSettings>) => void

  // Utility
  formatCurrency: (value: number) => string
  formatDate: (date: Date | string) => string
  formatNumber: (value: number, decimals?: number) => string
}

const StoreContext = createContext<StoreContextValue | undefined>(undefined)

// ===========================================
// PROVIDER
// ===========================================

interface StoreProviderProps {
  children: ReactNode
}

export function StoreProvider({ children }: StoreProviderProps) {
  const [state, dispatch] = useReducer(storeReducer, initialState)

  // Fetch stores on mount
  const refreshStores = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true })
    dispatch({ type: 'SET_ERROR', payload: null })

    try {
      const response = await fetch('/api/stores')
      if (!response.ok) {
        throw new Error('Failed to fetch stores')
      }

      const data = await response.json()
      dispatch({ type: 'SET_STORES', payload: data.stores || [] })
    } catch (error) {
      console.error('Error fetching stores:', error)
      dispatch({ type: 'SET_ERROR', payload: 'Kunde inte hamta butiker' })
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
      dispatch({ type: 'SET_INITIALIZED', payload: true })
    }
  }, [])

  // Initialize on mount
  useEffect(() => {
    refreshStores()
  }, [refreshStores])

  // Load settings from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSettings = localStorage.getItem('trueprofit_settings')
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings)
          dispatch({ type: 'SET_SETTINGS', payload: parsed })
        } catch {
          // Ignore parse errors
        }
      }
    }
  }, [])

  // Save settings to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && state.initialized) {
      localStorage.setItem('trueprofit_settings', JSON.stringify(state.settings))
    }
  }, [state.settings, state.initialized])

  // Actions
  const setActiveStore = useCallback((store: Store | null) => {
    dispatch({ type: 'SET_ACTIVE_STORE', payload: store })
    // Save to localStorage for persistence
    if (typeof window !== 'undefined') {
      if (store) {
        localStorage.setItem('trueprofit_active_store', store.id)
      } else {
        localStorage.removeItem('trueprofit_active_store')
      }
    }
  }, [])

  const addStore = useCallback((store: Store) => {
    dispatch({ type: 'SET_STORES', payload: [...state.stores, store] })
  }, [state.stores])

  const updateStore = useCallback((store: Store) => {
    dispatch({ type: 'UPDATE_STORE', payload: store })
  }, [])

  const removeStore = useCallback((storeId: string) => {
    dispatch({ type: 'REMOVE_STORE', payload: storeId })
  }, [])

  const updateSettings = useCallback((settings: Partial<StoreSettings>) => {
    dispatch({ type: 'SET_SETTINGS', payload: settings })
  }, [])

  // Utility functions
  const formatCurrency = useCallback(
    (value: number): string => {
      return new Intl.NumberFormat(state.settings.locale, {
        style: 'currency',
        currency: state.activeStore?.currency || state.settings.defaultCurrency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value)
    },
    [state.settings.locale, state.activeStore?.currency, state.settings.defaultCurrency]
  )

  const formatDate = useCallback(
    (date: Date | string): string => {
      const dateObj = typeof date === 'string' ? new Date(date) : date
      return dateObj.toLocaleDateString(state.settings.locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    },
    [state.settings.locale]
  )

  const formatNumber = useCallback(
    (value: number, decimals = 0): string => {
      return new Intl.NumberFormat(state.settings.locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value)
    },
    [state.settings.locale]
  )

  const value: StoreContextValue = {
    ...state,
    setActiveStore,
    refreshStores,
    addStore,
    updateStore,
    removeStore,
    updateSettings,
    formatCurrency,
    formatDate,
    formatNumber,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

// ===========================================
// HOOK
// ===========================================

export function useStore(): StoreContextValue {
  const context = useContext(StoreContext)
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider')
  }
  return context
}

// Selective hooks for better performance
export function useActiveStore() {
  const { activeStore, setActiveStore } = useStore()
  return { activeStore, setActiveStore }
}

export function useStoreSettings() {
  const { settings, updateSettings } = useStore()
  return { settings, updateSettings }
}

export function useStoreFormatters() {
  const { formatCurrency, formatDate, formatNumber } = useStore()
  return { formatCurrency, formatDate, formatNumber }
}

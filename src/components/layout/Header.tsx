'use client'

import { useSession, signOut } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Bell, LogOut, Settings, User, Search, Command, Store, Check } from 'lucide-react'
import Link from 'next/link'

interface StoreData {
  id: string
  name: string | null
  shopifyDomain: string
  isActive: boolean
}

export function Header() {
  const { data: session } = useSession()
  const [stores, setStores] = useState<StoreData[]>([])
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStores()
  }, [])

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/stores')
      if (res.ok) {
        const data = await res.json()
        setStores(data)
        // Select first active store by default
        const activeStore = data.find((s: StoreData) => s.isActive) || data[0]
        if (activeStore) {
          setSelectedStore(activeStore)
        }
      }
    } catch (error) {
      console.error('Failed to fetch stores:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleStoreSelect = (store: StoreData) => {
    setSelectedStore(store)
    // TODO: Trigger data refresh for selected store
  }

  const initials = session?.user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U'

  const displayName = selectedStore?.name || selectedStore?.shopifyDomain?.replace('.myshopify.com', '') || 'Select Store'

  return (
    <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-between px-6 sticky top-0 z-40" role="banner">
      <div className="flex items-center gap-4">
        {/* Search bar */}
        <div className="hidden md:flex items-center gap-2 px-3 py-2 bg-slate-100/80 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer group">
          <Search size={18} className="text-slate-400 group-hover:text-slate-500" />
          <span className="text-sm text-slate-500">Search...</span>
          <div className="flex items-center gap-1 ml-8">
            <kbd className="hidden lg:inline-flex h-5 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 font-mono text-[10px] font-medium text-slate-400">
              <Command size={10} />K
            </kbd>
          </div>
        </div>

        {/* Store selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="hidden lg:flex items-center gap-2 h-10 px-3 bg-white border-slate-200 hover:bg-slate-50">
              <div className="w-6 h-6 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-md flex items-center justify-center">
                <Store size={14} className="text-white" />
              </div>
              <span className="font-medium text-slate-700 max-w-[150px] truncate">
                {loading ? 'Loading...' : displayName}
              </span>
              <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64" align="start">
            <DropdownMenuLabel>Your Stores</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {stores.length === 0 && !loading ? (
              <div className="px-2 py-4 text-center">
                <p className="text-sm text-slate-500">No stores connected</p>
                <Link href="/settings/stores" className="text-sm text-blue-600 hover:underline mt-1 block">
                  Connect your first store
                </Link>
              </div>
            ) : (
              stores.map((store) => (
                <DropdownMenuItem
                  key={store.id}
                  className="cursor-pointer"
                  onClick={() => handleStoreSelect(store)}
                >
                  <div className="flex items-center gap-2 w-full">
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center ${
                      store.isActive
                        ? 'bg-gradient-to-br from-emerald-400 to-cyan-500'
                        : 'bg-slate-300'
                    }`}>
                      <Store size={14} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {store.name || store.shopifyDomain.replace('.myshopify.com', '')}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{store.shopifyDomain}</div>
                    </div>
                    {selectedStore?.id === store.id && (
                      <Check size={16} className="text-emerald-600 flex-shrink-0" />
                    )}
                  </div>
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/settings/stores">
                <Settings className="mr-2 h-4 w-4" />
                Manage Stores
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-3">
        {/* Live indicator */}
        {selectedStore?.isActive && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full">
            <div className="w-2 h-2 bg-emerald-500 rounded-full status-dot-pulse" />
            <span className="text-xs font-medium text-emerald-700">Live</span>
          </div>
        )}

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 rounded-xl hover:bg-slate-100"
          aria-label="View notifications"
        >
          <Bell size={20} className="text-slate-600" />
          <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white" aria-hidden="true" />
          <span className="sr-only">You have new notifications</span>
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-10 w-10 rounded-xl hover:bg-slate-100 p-0"
              aria-label="Open user menu"
            >
              <Avatar className="h-9 w-9 ring-2 ring-slate-100">
                <AvatarImage src={session?.user?.image || ''} alt={session?.user?.name || 'User avatar'} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-violet-600 text-white font-medium text-sm">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{session?.user?.name || 'User'}</p>
                <p className="text-xs leading-none text-slate-500">{session?.user?.email || 'user@example.com'}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/profile" className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-rose-600 focus:text-rose-600 focus:bg-rose-50"
              onClick={() => signOut({ callbackUrl: '/login' })}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

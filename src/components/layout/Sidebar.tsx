'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Package,
  DollarSign,
  Receipt,
  FileText,
  Megaphone,
  Settings,
  ChevronLeft,
  ChevronRight,
  Store,
  HelpCircle,
  Sparkles,
} from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'COGS', href: '/cogs', icon: DollarSign },
  { name: 'Expenses', href: '/expenses', icon: Receipt },
  { name: 'P&L Report', href: '/pnl', icon: FileText },
  { name: 'Ads', href: '/ads', icon: Megaphone },
  // Bank page still exists at /bank but hidden from main navigation
]

const bottomNavigation = [
  { name: 'Stores', href: '/settings/stores', icon: Store },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-slate-900 transition-all duration-300 relative',
        collapsed ? 'w-[72px]' : 'w-64'
      )}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-800/50 via-transparent to-slate-950/50 pointer-events-none" />

      {/* Logo */}
      <div className="relative z-10 flex items-center justify-between h-16 px-4 border-b border-slate-800/80">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl blur-sm opacity-50 group-hover:opacity-70 transition-opacity" />
              <div className="relative w-9 h-9 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center font-bold text-lg text-white shadow-lg">
                T
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-white text-[15px] leading-tight">TrueProfit</span>
              <span className="text-[10px] text-slate-500 font-medium tracking-wide">PROFIT ANALYTICS</span>
            </div>
          </Link>
        )}
        {collapsed && (
          <Link href="/" className="mx-auto">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl blur-sm opacity-50" />
              <div className="relative w-9 h-9 bg-gradient-to-br from-blue-500 to-violet-600 rounded-xl flex items-center justify-center font-bold text-lg text-white">
                T
              </div>
            </div>
          </Link>
        )}
        {!collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="text-slate-500 hover:text-white hover:bg-slate-800/80 h-8 w-8"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={16} />
          </Button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="relative z-10 flex justify-center py-3 border-b border-slate-800/80">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="text-slate-500 hover:text-white hover:bg-slate-800/80 h-8 w-8"
            aria-label="Expand sidebar"
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      )}

      {/* Main Navigation */}
      <nav className="relative z-10 flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-thin" aria-label="Primary navigation">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              )}
              title={collapsed ? item.name : undefined}
            >
              {/* Active indicator */}
              {isActive && (
                <>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600/90 to-violet-600/90 rounded-xl" />
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-violet-600 rounded-xl opacity-50 blur-sm" />
                </>
              )}

              <item.icon size={20} className="relative z-10 flex-shrink-0" />
              {!collapsed && <span className="relative z-10">{item.name}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Upgrade Banner */}
      {!collapsed && (
        <div className="relative z-10 mx-3 mb-3 p-4 rounded-xl bg-gradient-to-br from-blue-600/20 to-violet-600/20 border border-slate-700/50">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium text-white">Pro Features</span>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Unlock advanced analytics, unlimited stores, and priority support.
          </p>
          <button className="w-full py-2 px-3 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg shadow-blue-500/20">
            Upgrade Now
          </button>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="relative z-10 px-3 py-3 border-t border-slate-800/80 space-y-1">
        {bottomNavigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href))

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-500 hover:bg-slate-800/60 hover:text-white'
              )}
              title={collapsed ? item.name : undefined}
            >
              <item.icon size={20} className="flex-shrink-0" />
              {!collapsed && <span>{item.name}</span>}
            </Link>
          )
        })}

        {/* Help link */}
        {!collapsed && (
          <a
            href="#"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-800/60 hover:text-white transition-all duration-200"
          >
            <HelpCircle size={20} className="flex-shrink-0" />
            <span>Help & Support</span>
          </a>
        )}
      </div>

      {/* User footer */}
      {!collapsed && (
        <div className="relative z-10 px-4 py-3 border-t border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-lg flex items-center justify-center text-white text-sm font-bold">
              K
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">Kristoffer</div>
              <div className="text-xs text-slate-500">Free Plan</div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

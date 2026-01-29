'use client'

import { cn } from '@/lib/utils'
import Link from 'next/link'
import {
  Upload,
  Download,
  RefreshCw,
  FileText,
  ArrowRight,
  Plus,
  Store,
  Megaphone,
} from 'lucide-react'

interface QuickAction {
  id: string
  title: string
  description: string
  icon: React.ElementType
  href: string
  color: string
  bgColor: string
}

const defaultActions: QuickAction[] = [
  {
    id: 'import-cogs',
    title: 'Import COGS',
    description: 'Upload CSV with product costs',
    icon: Upload,
    href: '/cogs',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 hover:bg-blue-100',
  },
  {
    id: 'add-expense',
    title: 'Add Expense',
    description: 'Track a new business cost',
    icon: Plus,
    href: '/expenses',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50 hover:bg-violet-100',
  },
  {
    id: 'generate-pnl',
    title: 'P&L Report',
    description: 'Generate profit & loss report',
    icon: FileText,
    href: '/pnl',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 hover:bg-emerald-100',
  },
  {
    id: 'sync-store',
    title: 'Sync Store',
    description: 'Refresh Shopify data',
    icon: RefreshCw,
    href: '/settings/stores',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 hover:bg-amber-100',
  },
]

interface QuickActionsProps {
  actions?: QuickAction[]
  className?: string
}

export function QuickActions({ actions = defaultActions, className }: QuickActionsProps) {
  return (
    <div className={cn('grid grid-cols-2 md:grid-cols-4 gap-3', className)}>
      {actions.map((action) => {
        const Icon = action.icon
        return (
          <Link
            key={action.id}
            href={action.href}
            className={cn(
              'group flex items-center gap-3 p-4 rounded-xl transition-all duration-200',
              'border border-slate-200/60 hover:border-slate-200',
              'bg-white hover:shadow-md',
            )}
          >
            <div className={cn('p-2.5 rounded-xl transition-colors', action.bgColor)}>
              <Icon className={cn('w-5 h-5', action.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-slate-800 text-sm group-hover:text-slate-900">
                {action.title}
              </div>
              <div className="text-xs text-slate-500 truncate">{action.description}</div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all" />
          </Link>
        )
      })}
    </div>
  )
}

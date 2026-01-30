'use client'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  Package,
  ShoppingCart,
  Receipt,
  Landmark,
  Megaphone,
  DollarSign,
  Store,
  FileText,
  TrendingUp,
  Sparkles
} from 'lucide-react'

export type EmptyStateType =
  | 'orders'
  | 'products'
  | 'expenses'
  | 'bank'
  | 'ads'
  | 'cogs'
  | 'store'
  | 'pnl'
  | 'generic'

interface EmptyStateConfig {
  icon: React.ElementType
  title: string
  description: string
  primaryAction?: {
    label: string
    href: string
  }
  secondaryAction?: {
    label: string
    href: string
  }
  gradient: string
  iconBg: string
}

const emptyStateConfigs: Record<EmptyStateType, EmptyStateConfig> = {
  orders: {
    icon: ShoppingCart,
    title: 'Inga ordrar ännu',
    description: 'Koppla din Shopify-butik för att importera dina ordrar och börja spåra din vinst.',
    primaryAction: {
      label: 'Koppla Shopify',
      href: '/settings/stores',
    },
    gradient: 'from-amber-500/20 to-orange-500/20',
    iconBg: 'bg-amber-100 text-amber-600',
  },
  products: {
    icon: Package,
    title: 'Inga produkter importerade',
    description: 'Dina produkter synkas automatiskt när du kopplat din Shopify-butik.',
    primaryAction: {
      label: 'Koppla Shopify',
      href: '/settings/stores',
    },
    secondaryAction: {
      label: 'Lägg till COGS',
      href: '/cogs',
    },
    gradient: 'from-blue-500/20 to-cyan-500/20',
    iconBg: 'bg-blue-100 text-blue-600',
  },
  expenses: {
    icon: Receipt,
    title: 'Inga utgifter tillagda',
    description: 'Lägg till dina fasta kostnader, löner och andra utgifter för att se din riktiga vinst.',
    primaryAction: {
      label: 'Lägg till utgift',
      href: '/expenses?action=new',
    },
    gradient: 'from-rose-500/20 to-pink-500/20',
    iconBg: 'bg-rose-100 text-rose-600',
  },
  bank: {
    icon: Landmark,
    title: 'Ingen bankdata importerad',
    description: 'Importera dina banktransaktioner för automatisk kategorisering och bättre överblick.',
    primaryAction: {
      label: 'Importera CSV',
      href: '/bank?action=import',
    },
    gradient: 'from-emerald-500/20 to-teal-500/20',
    iconBg: 'bg-emerald-100 text-emerald-600',
  },
  ads: {
    icon: Megaphone,
    title: 'Inga annonskonton kopplade',
    description: 'Koppla Facebook Ads eller Google Ads för att spåra din ROAS och annonskostnader.',
    primaryAction: {
      label: 'Koppla Facebook',
      href: '/ads?connect=facebook',
    },
    secondaryAction: {
      label: 'Koppla Google',
      href: '/ads?connect=google',
    },
    gradient: 'from-violet-500/20 to-purple-500/20',
    iconBg: 'bg-violet-100 text-violet-600',
  },
  cogs: {
    icon: DollarSign,
    title: 'Ingen COGS-data',
    description: 'Lägg till inköpspris för dina produkter för att beräkna bruttomarginal.',
    primaryAction: {
      label: 'Importera CSV',
      href: '/cogs?action=import',
    },
    secondaryAction: {
      label: 'Lägg till manuellt',
      href: '/cogs?action=new',
    },
    gradient: 'from-cyan-500/20 to-blue-500/20',
    iconBg: 'bg-cyan-100 text-cyan-600',
  },
  store: {
    icon: Store,
    title: 'Ingen butik kopplad',
    description: 'Koppla din Shopify-butik för att börja spåra dina vinster.',
    primaryAction: {
      label: 'Koppla Shopify',
      href: '/settings/stores',
    },
    gradient: 'from-indigo-500/20 to-violet-500/20',
    iconBg: 'bg-indigo-100 text-indigo-600',
  },
  pnl: {
    icon: FileText,
    title: 'Inte tillräckligt med data',
    description: 'Du behöver minst en order för att generera en resultatrapport.',
    primaryAction: {
      label: 'Koppla Shopify',
      href: '/settings/stores',
    },
    gradient: 'from-slate-500/20 to-zinc-500/20',
    iconBg: 'bg-slate-100 text-slate-600',
  },
  generic: {
    icon: TrendingUp,
    title: 'Ingen data att visa',
    description: 'Det finns ingen data att visa för tillfället.',
    gradient: 'from-slate-500/20 to-zinc-500/20',
    iconBg: 'bg-slate-100 text-slate-600',
  },
}

interface EmptyStateProps {
  type: EmptyStateType
  className?: string
  customTitle?: string
  customDescription?: string
  customPrimaryAction?: {
    label: string
    href?: string
    onClick?: () => void
  }
  customSecondaryAction?: {
    label: string
    href?: string
    onClick?: () => void
  }
}

export function EmptyState({
  type,
  className,
  customTitle,
  customDescription,
  customPrimaryAction,
  customSecondaryAction,
}: EmptyStateProps) {
  const config = emptyStateConfigs[type]
  const Icon = config.icon

  const title = customTitle || config.title
  const description = customDescription || config.description
  const primaryAction = customPrimaryAction || config.primaryAction
  const secondaryAction = customSecondaryAction || config.secondaryAction

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center p-8 md:p-12 rounded-2xl',
        'bg-gradient-to-br border border-slate-200/80',
        config.gradient,
        className
      )}
    >
      {/* Decorative elements */}
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/30 rounded-full blur-2xl" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-white/30 rounded-full blur-2xl" />
      </div>

      {/* Sparkles decoration */}
      <div className="absolute top-4 right-4">
        <Sparkles className="w-5 h-5 text-slate-300" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center max-w-md">
        {/* Icon */}
        <div className={cn('w-16 h-16 rounded-2xl flex items-center justify-center mb-4', config.iconBg)}>
          <Icon className="w-8 h-8" />
        </div>

        {/* Title */}
        <h3 className="text-xl font-semibold text-slate-800 mb-2">
          {title}
        </h3>

        {/* Description */}
        <p className="text-slate-600 mb-6">
          {description}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {primaryAction && (
            'href' in primaryAction && primaryAction.href ? (
              <Button asChild>
                <Link href={primaryAction.href}>
                  {primaryAction.label}
                </Link>
              </Button>
            ) : 'onClick' in primaryAction && primaryAction.onClick ? (
              <Button onClick={primaryAction.onClick}>
                {primaryAction.label}
              </Button>
            ) : null
          )}
          {secondaryAction && (
            'href' in secondaryAction && secondaryAction.href ? (
              <Button variant="outline" asChild>
                <Link href={secondaryAction.href}>
                  {secondaryAction.label}
                </Link>
              </Button>
            ) : 'onClick' in secondaryAction && secondaryAction.onClick ? (
              <Button variant="outline" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            ) : null
          )}
        </div>
      </div>
    </div>
  )
}

// Mini empty state for smaller sections
interface MiniEmptyStateProps {
  icon?: React.ElementType
  title: string
  description?: string
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
  className?: string
}

export function MiniEmptyState({
  icon: Icon = Package,
  title,
  description,
  action,
  className,
}: MiniEmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-8 px-4 text-center', className)}>
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-600 mb-1">{title}</p>
      {description && (
        <p className="text-xs text-slate-400 mb-3 max-w-xs">{description}</p>
      )}
      {action && (
        action.href ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        )
      )}
    </div>
  )
}

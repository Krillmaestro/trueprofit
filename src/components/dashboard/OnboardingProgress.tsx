'use client'

import { cn } from '@/lib/utils'
import { Check, Store, Package, Receipt, Megaphone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { useState } from 'react'

interface OnboardingStep {
  id: string
  title: string
  description: string
  href: string
  icon: React.ElementType
  completed: boolean
}

interface OnboardingProgressProps {
  steps: OnboardingStep[]
  onDismiss?: () => void
  className?: string
}

export function OnboardingProgress({ steps, onDismiss, className }: OnboardingProgressProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const completedSteps = steps.filter((s) => s.completed).length
  const progress = (completedSteps / steps.length) * 100

  if (completedSteps === steps.length) {
    return null
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl',
        'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
        'border border-slate-700/50',
        className
      )}
    >
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white">Get Started</h3>
            <p className="text-sm text-slate-400 mt-0.5">
              Complete these steps to unlock full profit tracking
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">{completedSteps}/{steps.length}</span>
              <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700/50"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <svg
                className={cn('w-4 h-4 transition-transform', !isExpanded && 'rotate-180')}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            </Button>
            {onDismiss && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700/50"
                onClick={onDismiss}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Steps */}
        {isExpanded && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {steps.map((step, index) => {
              const Icon = step.icon
              const isNext = !step.completed && steps.slice(0, index).every((s) => s.completed)

              return (
                <Link
                  key={step.id}
                  href={step.href}
                  className={cn(
                    'group relative flex items-start gap-3 p-4 rounded-xl transition-all duration-200',
                    step.completed
                      ? 'bg-emerald-500/10 border border-emerald-500/20'
                      : isNext
                      ? 'bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/20'
                      : 'bg-slate-800/50 border border-slate-700/50 hover:bg-slate-800'
                  )}
                >
                  {/* Step number / check */}
                  <div
                    className={cn(
                      'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
                      step.completed
                        ? 'bg-emerald-500'
                        : isNext
                        ? 'bg-blue-500'
                        : 'bg-slate-700'
                    )}
                  >
                    {step.completed ? (
                      <Check className="w-4 h-4 text-white" />
                    ) : (
                      <Icon className="w-4 h-4 text-white" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div
                      className={cn(
                        'font-medium text-sm',
                        step.completed ? 'text-emerald-400' : 'text-white'
                      )}
                    >
                      {step.title}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                      {step.description}
                    </div>
                  </div>

                  {/* Arrow for next step */}
                  {isNext && (
                    <svg
                      className="w-4 h-4 text-blue-400 group-hover:translate-x-0.5 transition-transform"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Default steps configuration
export const defaultOnboardingSteps: OnboardingStep[] = [
  {
    id: 'connect-store',
    title: 'Connect Shopify',
    description: 'Link your Shopify store to import products and orders',
    href: '/settings/stores',
    icon: Store,
    completed: false,
  },
  {
    id: 'setup-cogs',
    title: 'Set up COGS',
    description: 'Add Cost of Goods Sold for accurate profit calculation',
    href: '/cogs',
    icon: Package,
    completed: false,
  },
  {
    id: 'add-expenses',
    title: 'Add Expenses',
    description: 'Track fixed costs, salaries, and other business expenses',
    href: '/expenses',
    icon: Receipt,
    completed: false,
  },
  {
    id: 'connect-ads',
    title: 'Connect Ads',
    description: 'Import ad spend from Facebook, Google, and more',
    href: '/ads',
    icon: Megaphone,
    completed: false,
  },
]

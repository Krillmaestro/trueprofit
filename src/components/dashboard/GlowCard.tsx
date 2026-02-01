'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface GlowCardProps {
  children: ReactNode
  className?: string
  glowColor?: 'emerald' | 'blue' | 'violet' | 'amber' | 'rose' | 'cyan'
  hover?: boolean
}

const glowColors = {
  emerald: 'before:from-emerald-500/20 before:to-emerald-500/0 hover:before:from-emerald-500/30 dark:before:from-emerald-400/15 dark:hover:before:from-emerald-400/25',
  blue: 'before:from-blue-500/20 before:to-blue-500/0 hover:before:from-blue-500/30 dark:before:from-blue-400/15 dark:hover:before:from-blue-400/25',
  violet: 'before:from-violet-500/20 before:to-violet-500/0 hover:before:from-violet-500/30 dark:before:from-violet-400/15 dark:hover:before:from-violet-400/25',
  amber: 'before:from-amber-500/20 before:to-amber-500/0 hover:before:from-amber-500/30 dark:before:from-amber-400/15 dark:hover:before:from-amber-400/25',
  rose: 'before:from-rose-500/20 before:to-rose-500/0 hover:before:from-rose-500/30 dark:before:from-rose-400/15 dark:hover:before:from-rose-400/25',
  cyan: 'before:from-cyan-500/20 before:to-cyan-500/0 hover:before:from-cyan-500/30 dark:before:from-cyan-400/15 dark:hover:before:from-cyan-400/25',
}

export const GlowCard = memo(function GlowCard({ children, className, glowColor = 'blue', hover = true }: GlowCardProps) {
  return (
    <div
      className={cn(
        // Light mode
        'relative overflow-hidden rounded-2xl bg-white/80 backdrop-blur-sm border border-slate-200/60',
        'shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)]',
        // Dark mode
        'dark:bg-slate-900/80 dark:border-slate-700/60',
        'dark:shadow-[0_1px_3px_rgba(0,0,0,0.2),0_4px_12px_rgba(0,0,0,0.2)]',
        // Transitions
        'transition-all duration-300',
        // Hover states
        hover && 'hover:shadow-[0_4px_20px_rgba(0,0,0,0.08)] hover:border-slate-200',
        hover && 'dark:hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)] dark:hover:border-slate-600',
        // Glow effect
        'before:absolute before:inset-0 before:rounded-2xl before:bg-gradient-to-br before:transition-all before:duration-300',
        glowColors[glowColor],
        className
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  )
})

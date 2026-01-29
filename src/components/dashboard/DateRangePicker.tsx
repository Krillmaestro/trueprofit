'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar, ChevronDown } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

interface DateRange {
  startDate: Date
  endDate: Date
  label: string
}

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

const presets: { label: string; getValue: () => { startDate: Date; endDate: Date } }[] = [
  {
    label: 'Today',
    getValue: () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      return { startDate: today, endDate: end }
    },
  },
  {
    label: 'Yesterday',
    getValue: () => {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      yesterday.setHours(0, 0, 0, 0)
      const end = new Date()
      end.setDate(end.getDate() - 1)
      end.setHours(23, 59, 59, 999)
      return { startDate: yesterday, endDate: end }
    },
  },
  {
    label: 'Last 7 days',
    getValue: () => {
      const start = new Date()
      start.setDate(start.getDate() - 6)
      start.setHours(0, 0, 0, 0)
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      return { startDate: start, endDate: end }
    },
  },
  {
    label: 'Last 30 days',
    getValue: () => {
      const start = new Date()
      start.setDate(start.getDate() - 29)
      start.setHours(0, 0, 0, 0)
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      return { startDate: start, endDate: end }
    },
  },
  {
    label: 'This month',
    getValue: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return { startDate: start, endDate: end }
    },
  },
  {
    label: 'Last month',
    getValue: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      return { startDate: start, endDate: end }
    },
  },
  {
    label: 'This year',
    getValue: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), 0, 1)
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
      return { startDate: start, endDate: end }
    },
  },
]

function formatDateRange(start: Date, end: Date): string {
  const formatDate = (d: Date) =>
    d.toLocaleDateString('sv-SE', { month: 'short', day: 'numeric' })

  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()
  const sameDay = sameMonth && start.getDate() === end.getDate()

  if (sameDay) {
    return formatDate(start)
  }

  return `${formatDate(start)} - ${formatDate(end)}`
}

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)

  const handlePresetClick = (preset: typeof presets[0]) => {
    const { startDate, endDate } = preset.getValue()
    onChange({ startDate, endDate, label: preset.label })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'h-10 px-4 font-medium bg-white hover:bg-slate-50 border-slate-200',
            'shadow-sm hover:shadow transition-all',
            className
          )}
        >
          <Calendar className="w-4 h-4 mr-2 text-slate-500" />
          <span className="text-slate-700">{value.label}</span>
          <ChevronDown className="w-4 h-4 ml-2 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="end">
        <div className="space-y-1">
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm rounded-lg transition-colors',
                value.label === preset.label
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-100'
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Helper to get default "This month" range
export function getDefaultDateRange(): DateRange {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  return { startDate: start, endDate: end, label: 'This month' }
}

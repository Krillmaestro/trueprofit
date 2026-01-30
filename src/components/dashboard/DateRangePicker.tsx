'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { sv } from 'date-fns/locale'
import type { DateRange as DayPickerDateRange } from 'react-day-picker'

export interface DateRange {
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
    label: 'Idag',
    getValue: () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const end = new Date()
      end.setHours(23, 59, 59, 999)
      return { startDate: today, endDate: end }
    },
  },
  {
    label: 'Igår',
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
    label: 'Senaste 7 dagarna',
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
    label: 'Senaste 30 dagarna',
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
    label: 'Denna månad',
    getValue: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return { startDate: start, endDate: end }
    },
  },
  {
    label: 'Förra månaden',
    getValue: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      return { startDate: start, endDate: end }
    },
  },
  {
    label: 'Detta år',
    getValue: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), 0, 1)
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
      return { startDate: start, endDate: end }
    },
  },
]

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customRange, setCustomRange] = useState<DayPickerDateRange | undefined>({
    from: value.startDate,
    to: value.endDate,
  })
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date())

  const handlePresetClick = (preset: typeof presets[0]) => {
    const { startDate, endDate } = preset.getValue()
    onChange({ startDate, endDate, label: preset.label })
    setShowCustom(false)
    setOpen(false)
  }

  const handleCustomApply = () => {
    if (customRange?.from && customRange?.to) {
      const startDate = new Date(customRange.from)
      startDate.setHours(0, 0, 0, 0)
      const endDate = new Date(customRange.to)
      endDate.setHours(23, 59, 59, 999)

      const label = `${format(startDate, 'd MMM', { locale: sv })} - ${format(endDate, 'd MMM', { locale: sv })}`
      onChange({ startDate, endDate, label })
      setShowCustom(false)
      setOpen(false)
    }
  }

  const formatDisplayLabel = (range: DateRange) => {
    // Check if it matches a preset
    const matchingPreset = presets.find(p => p.label === range.label)
    if (matchingPreset) return range.label

    // Otherwise format the date range
    return `${format(range.startDate, 'd MMM', { locale: sv })} - ${format(range.endDate, 'd MMM', { locale: sv })}`
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
          <CalendarIcon className="w-4 h-4 mr-2 text-slate-500" />
          <span className="text-slate-700">{formatDisplayLabel(value)}</span>
          <ChevronDown className="w-4 h-4 ml-2 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0", showCustom ? "w-auto" : "w-56")} align="end">
        {!showCustom ? (
          <div className="p-2">
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

            <div className="border-t border-slate-200 mt-2 pt-2">
              <button
                onClick={() => {
                  setCustomRange({ from: value.startDate, to: value.endDate })
                  setCalendarMonth(value.startDate)
                  setShowCustom(true)
                }}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm rounded-lg transition-colors',
                  !presets.some(p => p.label === value.label)
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4" />
                  <span>Anpassat datum...</span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-3">
            {/* Header with back button */}
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
              <button
                onClick={() => setShowCustom(false)}
                className="p-1 rounded hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-slate-500" />
              </button>
              <span className="text-sm font-medium text-slate-700">Välj datumintervall</span>
            </div>

            {/* Selected range display */}
            <div className="flex items-center gap-2 mb-3 p-2 bg-slate-50 rounded-lg">
              <div className="flex-1 text-center">
                <div className="text-xs text-slate-500 mb-0.5">Från</div>
                <div className="text-sm font-medium text-slate-700">
                  {customRange?.from ? format(customRange.from, 'd MMM yyyy', { locale: sv }) : '—'}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
              <div className="flex-1 text-center">
                <div className="text-xs text-slate-500 mb-0.5">Till</div>
                <div className="text-sm font-medium text-slate-700">
                  {customRange?.to ? format(customRange.to, 'd MMM yyyy', { locale: sv }) : '—'}
                </div>
              </div>
            </div>

            {/* Calendar */}
            <Calendar
              mode="range"
              selected={customRange}
              onSelect={setCustomRange}
              month={calendarMonth}
              onMonthChange={setCalendarMonth}
              numberOfMonths={1}
              locale={sv}
              weekStartsOn={1}
              disabled={{ after: new Date() }}
              className="rounded-lg border border-slate-200"
            />

            {/* Quick select buttons */}
            <div className="flex gap-1.5 mt-3 flex-wrap">
              {[3, 7, 14, 30].map((days) => (
                <button
                  key={days}
                  onClick={() => {
                    const end = new Date()
                    const start = new Date()
                    start.setDate(start.getDate() - (days - 1))
                    setCustomRange({ from: start, to: end })
                  }}
                  className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 rounded transition-colors"
                >
                  {days} dagar
                </button>
              ))}
            </div>

            {/* Apply button */}
            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-200">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setShowCustom(false)}
              >
                Avbryt
              </Button>
              <Button
                size="sm"
                className="flex-1"
                disabled={!customRange?.from || !customRange?.to}
                onClick={handleCustomApply}
              >
                Tillämpa
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// Helper to get default "This month" range
export function getDefaultDateRange(): DateRange {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  return { startDate: start, endDate: end, label: 'Denna månad' }
}

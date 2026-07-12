"use client"

import { Search } from "lucide-react"
import type { DifficultyLevel, TaskFiltersState, TaskStatus } from "@/lib/types"
import { DIFFICULTY_LABELS } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface TaskFiltersProps {
  filters: TaskFiltersState
  onChange: (filters: TaskFiltersState) => void
  className?: string
}

const STATUS_OPTIONS: { value: TaskStatus | "all"; label: string }[] = [
  { value: "all", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
]

const DIFFICULTY_OPTIONS: { value: DifficultyLevel | "all"; label: string }[] = [
  { value: "all", label: "All Difficulties" },
  { value: "easy", label: DIFFICULTY_LABELS.easy },
  { value: "medium", label: DIFFICULTY_LABELS.medium },
  { value: "hard", label: DIFFICULTY_LABELS.hard },
]

export function TaskFilters({ filters, onChange, className }: TaskFiltersProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--charcoal,#1a1a1a)] p-4 sm:flex-row sm:items-end",
        className
      )}
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="task-search" className="text-[color:var(--white,#f5f5f5)]/60">
          Search
        </Label>
        <div className="relative">
          <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[color:var(--white,#f5f5f5)]/30" />
          <Input
            id="task-search"
            placeholder="Search tasks..."
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className="border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)] pl-9"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[color:var(--white,#f5f5f5)]/60">Status</Label>
        <Select
          value={filters.status}
          onValueChange={(value) =>
            onChange({ ...filters, status: value as TaskStatus | "all" })
          }
        >
          <SelectTrigger className="w-full min-w-[160px] border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[color:var(--white,#f5f5f5)]/60">Difficulty</Label>
        <Select
          value={filters.difficulty}
          onValueChange={(value) =>
            onChange({ ...filters, difficulty: value as DifficultyLevel | "all" })
          }
        >
          <SelectTrigger className="w-full min-w-[160px] border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIFFICULTY_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

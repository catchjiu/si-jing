import {
  format,
  formatDistanceToNow,
  differenceInMilliseconds,
  isPast,
  parseISO,
} from "date-fns"
import type { DifficultyLevel, SubmissionStatus, TaskStatus } from "@/lib/types"

function toDate(value: string | Date): Date {
  return typeof value === "string" ? parseISO(value) : value
}

export function formatDeadline(value: string | Date): string {
  return format(toDate(value), "MMM d, yyyy 'at' h:mm a")
}

export function formatRelative(value: string | Date): string {
  return formatDistanceToNow(toDate(value), { addSuffix: true })
}

export interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
  isOverdue: boolean
  totalMs: number
}

export function getCountdownParts(deadline: string | Date): CountdownParts {
  const target = toDate(deadline)
  const now = new Date()
  const diff = differenceInMilliseconds(target, now)
  const isOverdue = diff < 0
  const totalMs = Math.abs(diff)

  const days = Math.floor(totalMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((totalMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((totalMs % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((totalMs % (1000 * 60)) / 1000)

  return { days, hours, minutes, seconds, isOverdue, totalMs }
}

export function formatCountdown(deadline: string | Date): string {
  const { days, hours, minutes, seconds, isOverdue } = getCountdownParts(deadline)

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0 || days > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)

  const formatted = parts.join(" ")
  return isOverdue ? `Overdue by ${formatted}` : formatted
}

export function isOverdue(deadline: string | Date): boolean {
  return isPast(toDate(deadline))
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
}

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  pending: "bg-[color:var(--purple,#2d1b69)]/40 text-[color:var(--white,#f5f5f5)] border-[color:var(--purple,#2d1b69)]/60",
  in_progress: "bg-[color:var(--gold,#d4af37)]/15 text-[color:var(--gold,#d4af37)] border-[color:var(--gold,#d4af37)]/40",
  submitted: "bg-blue-500/15 text-blue-300 border-blue-500/40",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  rejected: "bg-red-500/15 text-red-300 border-red-500/40",
}

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  pending: "Awaiting Review",
  approved: "Approved",
  rejected: "Rejected",
}

export const SUBMISSION_STATUS_COLORS: Record<SubmissionStatus, string> = {
  pending: "bg-[color:var(--gold,#d4af37)]/15 text-[color:var(--gold,#d4af37)] border-[color:var(--gold,#d4af37)]/40",
  approved: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  rejected: "bg-red-500/15 text-red-300 border-red-500/40",
}

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
}

export const DIFFICULTY_COLORS: Record<DifficultyLevel, string> = {
  easy: "text-emerald-400",
  medium: "text-[color:var(--gold,#d4af37)]",
  hard: "text-red-400",
}

export function getStatusLabel(
  status: TaskStatus | SubmissionStatus,
  type: "task" | "submission" = "task"
): string {
  if (type === "submission") {
    return SUBMISSION_STATUS_LABELS[status as SubmissionStatus] ?? status
  }
  return TASK_STATUS_LABELS[status as TaskStatus] ?? status
}

export function getStatusColor(
  status: TaskStatus | SubmissionStatus,
  type: "task" | "submission" = "task"
): string {
  if (type === "submission") {
    return SUBMISSION_STATUS_COLORS[status as SubmissionStatus] ?? ""
  }
  return TASK_STATUS_COLORS[status as TaskStatus] ?? ""
}

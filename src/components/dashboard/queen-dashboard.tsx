"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import {
  AlarmClock,
  Ban,
  BookOpen,
  ChevronRight,
  ClipboardList,
  Clock,
  HandHeart,
  ImageIcon,
} from "lucide-react"
import type {
  DesireRequest,
  Punishment,
  QueenDashboardStats,
  SubmissionWithRelations,
  TaskWithRelations,
} from "@/lib/types"
import { formatDeadline, formatRelative } from "@/lib/format"
import { desireColor, desireLabel, REQUEST_TYPE_LABELS } from "@/lib/requests"
import { PUNISHMENT_TYPE_LABELS } from "@/lib/punishments"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/tasks/status-badge"
import { PunishmentCountdown } from "@/components/punishments/punishment-countdown"

interface QueenDashboardProps {
  tasks: TaskWithRelations[]
  submissions: SubmissionWithRelations[]
  pendingRequests: DesireRequest[]
  activePunishments: Punishment[]
  stats: QueenDashboardStats
}

function SectionHeader({
  title,
  href,
  linkLabel = "View all",
  count,
}: {
  title: string
  href?: string
  linkLabel?: string
  count?: number
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="font-heading text-lg text-ivory sm:text-xl">
        {title}
        {typeof count === "number" && count > 0 && (
          <span className="ml-2 text-sm font-sans text-muted-foreground">
            {count}
          </span>
        )}
      </h2>
      {href && (
        <Link
          href={href}
          className="shrink-0 text-xs text-gold hover:underline sm:text-sm"
        >
          {linkLabel}
        </Link>
      )}
    </div>
  )
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-gold/10 bg-charcoal/40 px-4 py-5 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

export function QueenDashboard({
  tasks,
  submissions,
  pendingRequests,
  activePunishments,
  stats,
}: QueenDashboardProps) {
  const activeTasks = tasks
    .filter((t) => !["approved", "rejected"].includes(t.status))
    .slice(0, 6)
  const recentSubs = submissions.slice(0, 5)
  const shownRequests = pendingRequests.slice(0, 4)
  const shownPunishments = activePunishments.slice(0, 3)

  const attention = [
    {
      href: "/dashboard/submissions",
      label: "Review",
      value: stats.pendingSubmissions,
      icon: Clock,
      tone: "gold" as const,
      show: stats.pendingSubmissions > 0,
    },
    {
      href: "/dashboard/requests",
      label: "Requests",
      value: stats.pendingRequests,
      icon: HandHeart,
      tone: "gold" as const,
      show: stats.pendingRequests > 0,
    },
    {
      href: "/dashboard/punishments",
      label: "Confirm",
      value: stats.pendingPunishments,
      icon: Ban,
      tone: "amber" as const,
      show: stats.pendingPunishments > 0,
    },
    {
      href: "/dashboard/check-ins",
      label: "Check-ins",
      value: stats.openCheckIns,
      icon: AlarmClock,
      tone: "gold" as const,
      show: stats.openCheckIns > 0,
    },
    {
      href: "/dashboard/protocol",
      label: "Rules",
      value: stats.unackedRules,
      icon: BookOpen,
      tone: "gold" as const,
      show: stats.unackedRules > 0,
    },
  ].filter((a) => a.show)

  const metrics = [
    {
      href: "/dashboard/tasks",
      label: "Tasks",
      value: stats.tasksAssigned,
      icon: ClipboardList,
    },
    {
      href: "/dashboard/submissions",
      label: "To review",
      value: stats.pendingSubmissions,
      icon: Clock,
    },
    {
      href: "/dashboard/requests",
      label: "Requests",
      value: stats.pendingRequests,
      icon: HandHeart,
    },
    {
      href: "/dashboard/punishments",
      label: "Active",
      value: stats.activePunishments,
      icon: Ban,
      danger: true,
    },
  ]

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-heading text-2xl text-ivory sm:text-3xl">
          Command Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What needs your attention
        </p>
      </div>

      {/* Compact metrics — 2×2 on phone, 4 across on larger */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {metrics.map((m) => {
          const Icon = m.icon
          return (
            <Link
              key={m.label}
              href={m.href}
              className={cn(
                "rounded-xl border bg-charcoal/80 p-3 transition-colors hover:bg-charcoal sm:p-4",
                m.danger
                  ? "border-red-500/25 hover:border-red-500/40"
                  : "border-gold/15 hover:border-gold/30"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {m.label}
                </p>
                <Icon
                  className={cn(
                    "size-3.5 shrink-0",
                    m.danger ? "text-red-400" : "text-gold/70"
                  )}
                />
              </div>
              <p
                className={cn(
                  "mt-1.5 font-heading text-2xl tabular-nums sm:text-3xl",
                  m.danger ? "text-red-300" : "text-gold"
                )}
              >
                {m.value}
              </p>
            </Link>
          )
        })}
      </div>

      {/* Action chips — only when something needs a decision */}
      {attention.length > 0 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
          {attention.map((a) => {
            const Icon = a.icon
            return (
              <Link
                key={a.href + a.label}
                href={a.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors",
                  a.tone === "amber"
                    ? "border-amber-500/35 bg-amber-950/30 text-amber-200 hover:bg-amber-950/50"
                    : "border-gold/30 bg-gold/10 text-gold hover:bg-gold/15"
                )}
              >
                <Icon className="size-3.5" />
                <span>
                  {a.value} {a.label}
                </span>
                <ChevronRight className="size-3.5 opacity-60" />
              </Link>
            )
          })}
        </div>
      )}

      {/* Two-column content on desktop; stacked on mobile */}
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        {/* Left: petitions + punishments */}
        <div className="space-y-6">
          <section>
            <SectionHeader
              title="Requests"
              href="/dashboard/requests"
              count={pendingRequests.length}
            />
            {shownRequests.length === 0 ? (
              <EmptyLine>No open requests.</EmptyLine>
            ) : (
              <ul className="space-y-2">
                {shownRequests.map((request) => (
                  <li key={request.id}>
                    <Link
                      href="/dashboard/requests"
                      className="flex items-center gap-3 rounded-xl border border-gold/15 bg-charcoal/70 px-3 py-3 transition-colors hover:border-gold/30 hover:bg-charcoal sm:gap-4 sm:px-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium text-ivory">
                            {request.title}
                          </p>
                          <Badge
                            variant="outline"
                            className="border-muted text-[10px] uppercase tracking-wider text-muted-foreground"
                          >
                            {REQUEST_TYPE_LABELS[request.request_type]}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatRelative(request.created_at)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            "font-heading text-xl tabular-nums sm:text-2xl",
                            desireColor(request.desire_level)
                          )}
                        >
                          {request.desire_level}
                        </p>
                        <p
                          className={cn(
                            "hidden text-[10px] uppercase tracking-wider sm:block",
                            desireColor(request.desire_level)
                          )}
                        >
                          {desireLabel(request.desire_level)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHeader
              title="Punishments"
              href="/dashboard/punishments"
              linkLabel="Manage"
              count={activePunishments.length}
            />
            {shownPunishments.length === 0 ? (
              <EmptyLine>No active punishments.</EmptyLine>
            ) : (
              <ul className="space-y-2">
                {shownPunishments.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-red-500/25 bg-red-950/15 px-3 py-3 sm:px-4"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 truncate font-heading text-base text-ivory sm:text-lg">
                        {p.title ||
                          PUNISHMENT_TYPE_LABELS[p.punishment_type] ||
                          "Punishment"}
                      </p>
                      <Badge
                        variant="outline"
                        className="border-red-500/40 text-[10px] uppercase tracking-wider text-red-300"
                      >
                        {PUNISHMENT_TYPE_LABELS[p.punishment_type] ??
                          p.punishment_type}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.clearance_mode === "task_debt"
                        ? "Clears when debt tasks are approved"
                        : `Ends ${formatDeadline(p.ends_at)}`}
                    </p>
                    {p.clearance_mode !== "task_debt" && (
                      <div className="mt-3">
                        <PunishmentCountdown endsAt={p.ends_at} size="sm" />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right: tasks + submissions */}
        <div className="space-y-6">
          <section>
            <SectionHeader
              title="Active tasks"
              href="/dashboard/tasks"
              count={
                tasks.filter((t) => !["approved", "rejected"].includes(t.status))
                  .length
              }
            />
            {activeTasks.length === 0 ? (
              <EmptyLine>No active tasks.</EmptyLine>
            ) : (
              <ul className="space-y-2">
                {activeTasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      href={`/dashboard/task/${task.id}`}
                      className="flex items-center gap-3 rounded-xl border border-gold/15 bg-charcoal/70 px-3 py-3 transition-colors hover:border-gold/30 hover:bg-charcoal sm:px-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ivory">
                          {task.title}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Due {formatDeadline(task.deadline)}
                          {(task.submission_count ?? 0) > 0
                            ? ` · ${task.submission_count} submission${
                                task.submission_count === 1 ? "" : "s"
                              }`
                            : ""}
                        </p>
                      </div>
                      <StatusBadge status={task.status} type="task" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <SectionHeader
              title="Submissions"
              href="/dashboard/submissions"
              count={stats.pendingSubmissions || undefined}
            />
            {recentSubs.length === 0 ? (
              <EmptyLine>No submissions yet.</EmptyLine>
            ) : (
              <ul className="space-y-2">
                {recentSubs.map((submission) => (
                  <li key={submission.id}>
                    <Link
                      href={`/dashboard/submissions/${submission.id}`}
                      className="flex items-center gap-3 rounded-xl border border-gold/15 bg-charcoal/70 px-3 py-3 transition-colors hover:border-gold/30 hover:bg-charcoal sm:px-4"
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-royal/25">
                        <ImageIcon className="size-4 text-gold/60" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ivory">
                          {submission.task?.title ?? "Submission"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRelative(submission.submitted_at)}
                        </p>
                      </div>
                      <StatusBadge
                        status={submission.status}
                        type="submission"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

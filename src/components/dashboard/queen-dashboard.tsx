"use client"

import Link from "next/link"
import {
  Ban,
  BookOpen,
  ClipboardList,
  Clock,
  HandHeart,
  ImageIcon,
  AlarmClock,
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
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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

export function QueenDashboard({
  tasks,
  submissions,
  pendingRequests,
  activePunishments,
  stats,
}: QueenDashboardProps) {
  const activeTasks = tasks.filter(
    (t) => !["approved", "rejected"].includes(t.status)
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl text-ivory sm:text-3xl">
          Command Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tasks, petitions, and active consequences
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        <Card className="border-gold/15 bg-charcoal">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Tasks</CardDescription>
            <ClipboardList className="size-4 text-gold" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-gold">
              {stats.tasksAssigned}
            </p>
          </CardContent>
        </Card>

        <Card className="border-gold/15 bg-charcoal">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Submissions</CardDescription>
            <Clock className="size-4 text-gold" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-gold">
              {stats.pendingSubmissions}
            </p>
          </CardContent>
        </Card>

        <Card className="border-gold/15 bg-charcoal">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Requests</CardDescription>
            <HandHeart className="size-4 text-gold" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-gold">
              {stats.pendingRequests}
            </p>
          </CardContent>
        </Card>

        <Card className="border-gold/15 bg-charcoal">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Punishments</CardDescription>
            <Ban className="size-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-red-300">
              {stats.activePunishments}
            </p>
          </CardContent>
        </Card>

        <Card className="border-gold/15 bg-charcoal">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Unacked rules</CardDescription>
            <BookOpen className="size-4 text-gold" />
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/protocol" className="font-heading text-3xl text-gold hover:underline">
              {stats.unackedRules}
            </Link>
          </CardContent>
        </Card>

        <Card className="border-gold/15 bg-charcoal">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Open check-ins</CardDescription>
            <AlarmClock className="size-4 text-gold" />
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/check-ins" className="font-heading text-3xl text-gold hover:underline">
              {stats.openCheckIns}
            </Link>
          </CardContent>
        </Card>

        <Card className="border-gold/15 bg-charcoal">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Pending punish</CardDescription>
            <Ban className="size-4 text-amber-300" />
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/punishments" className="font-heading text-3xl text-amber-300 hover:underline">
              {stats.pendingPunishments}
            </Link>
          </CardContent>
        </Card>

      </div>

      {/* Active punishments */}
      <Card className="border-red-500/25 bg-charcoal">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-heading text-ivory">
              Active Punishments
            </CardTitle>
            <CardDescription>
              Ongoing consequences, including contact restrictions
            </CardDescription>
          </div>
          <Link
            href="/dashboard/punishments"
            className="text-sm text-gold hover:underline"
          >
            Manage
          </Link>
        </CardHeader>
        <CardContent>
          {activePunishments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No active punishments.
            </p>
          ) : (
            <ul className="space-y-4">
              {activePunishments.map((p) => (
                <li
                  key={p.id}
                  className="rounded-xl border border-red-500/30 bg-red-950/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-heading text-lg text-ivory">
                          {p.title ||
                            (p.punishment_type === "contact_restriction"
                              ? "Contact Restricted"
                              : "Punishment")}
                        </p>
                        <Badge
                          variant="outline"
                          className="border-red-500/40 text-[10px] uppercase tracking-wider text-red-300"
                        >
                          {p.punishment_type === "contact_restriction"
                            ? "Contact"
                            : "Custom"}
                        </Badge>
                      </div>
                      {p.reason && (
                        <p className="text-sm text-muted-foreground">
                          {p.reason}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Ends {formatDeadline(p.ends_at)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Time remaining
                    </p>
                    <PunishmentCountdown endsAt={p.ends_at} size="sm" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Pending requests */}
      <Card className="border-gold/15 bg-charcoal">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-heading text-ivory">
              Pending Requests
            </CardTitle>
            <CardDescription>Petitions awaiting your word</CardDescription>
          </div>
          <Link
            href="/dashboard/requests"
            className="text-sm text-gold hover:underline"
          >
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {pendingRequests.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No open requests.
            </p>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <Link
                  key={request.id}
                  href="/dashboard/requests"
                  className={cn(
                    "flex items-center gap-4 rounded-lg border border-gold/15 p-4",
                    "transition-all duration-300 hover:border-gold/35 hover:bg-void/40"
                  )}
                >
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-royal/30">
                    <HandHeart className="size-5 text-gold/70" />
                  </div>
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatRelative(request.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        "font-heading text-2xl tabular-nums",
                        desireColor(request.desire_level)
                      )}
                    >
                      {request.desire_level}
                    </p>
                    <p
                      className={cn(
                        "text-[10px] uppercase tracking-wider",
                        desireColor(request.desire_level)
                      )}
                    >
                      {desireLabel(request.desire_level)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active tasks table */}
      <Card className="border-gold/15 bg-charcoal">
        <CardHeader>
          <CardTitle className="font-heading text-ivory">Active Tasks</CardTitle>
          <CardDescription>
            {activeTasks.length} task{activeTasks.length !== 1 ? "s" : ""} in
            progress
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeTasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No active tasks. Assign a new task to begin.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gold/10 text-left text-muted-foreground">
                    <th className="pb-3 pr-4 font-medium">Task</th>
                    <th className="pb-3 pr-4 font-medium">Deadline</th>
                    <th className="pb-3 pr-4 font-medium">Status</th>
                    <th className="pb-3 font-medium">Submissions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTasks.map((task) => (
                    <tr
                      key={task.id}
                      className="border-b border-gold/5 transition-colors hover:bg-void/40"
                    >
                      <td className="py-3 pr-4">
                        <Link
                          href={`/dashboard/task/${task.id}`}
                          className="font-medium text-ivory hover:text-gold"
                        >
                          {task.title}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatDeadline(task.deadline)}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={task.status} type="task" />
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {task.submission_count ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent submissions feed */}
      <Card className="border-gold/15 bg-charcoal">
        <CardHeader>
          <CardTitle className="font-heading text-ivory">
            Recent Submissions
          </CardTitle>
          <CardDescription>Latest proof awaiting your review</CardDescription>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No submissions yet.
            </p>
          ) : (
            <div className="space-y-3">
              {submissions.slice(0, 8).map((submission) => (
                <Link
                  key={submission.id}
                  href={`/dashboard/submissions/${submission.id}`}
                  className={cn(
                    "flex items-center gap-4 rounded-lg border border-gold/10 p-4",
                    "transition-all duration-300 hover:border-gold/30 hover:bg-void/40"
                  )}
                >
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-royal/30">
                    <ImageIcon className="size-5 text-gold/60" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ivory">
                      {submission.task?.title ?? "Submission"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatRelative(submission.submitted_at)}
                    </p>
                  </div>
                  <StatusBadge status={submission.status} type="submission" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

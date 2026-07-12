"use client"

import Link from "next/link"
import { ClipboardList, Clock, CheckCircle2, ImageIcon } from "lucide-react"
import type { QueenDashboardStats, SubmissionWithRelations, TaskWithRelations } from "@/lib/types"
import { formatDeadline, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { StatusBadge } from "@/components/tasks/status-badge"

interface QueenDashboardProps {
  tasks: TaskWithRelations[]
  submissions: SubmissionWithRelations[]
  stats: QueenDashboardStats
}

export function QueenDashboard({ tasks, submissions, stats }: QueenDashboardProps) {
  const activeTasks = tasks.filter(
    (t) => !["approved", "rejected"].includes(t.status)
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl text-[color:var(--white,#f5f5f5)]">
          Command Center
        </h1>
        <p className="mt-1 text-sm text-[color:var(--white,#f5f5f5)]/50">
          Overview of assigned tasks and pending reviews
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--charcoal,#1a1a1a)] ring-[color:var(--gold,#d4af37)]/10">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription className="text-[color:var(--white,#f5f5f5)]/50">
              Tasks Assigned
            </CardDescription>
            <ClipboardList className="size-4 text-[color:var(--gold,#d4af37)]" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-[color:var(--gold,#d4af37)]">
              {stats.tasksAssigned}
            </p>
          </CardContent>
        </Card>

        <Card className="border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--charcoal,#1a1a1a)] ring-[color:var(--gold,#d4af37)]/10">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription className="text-[color:var(--white,#f5f5f5)]/50">
              Pending Submissions
            </CardDescription>
            <Clock className="size-4 text-[color:var(--gold,#d4af37)]" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-[color:var(--gold,#d4af37)]">
              {stats.pendingSubmissions}
            </p>
          </CardContent>
        </Card>

        <Card className="border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--charcoal,#1a1a1a)] ring-[color:var(--gold,#d4af37)]/10">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription className="text-[color:var(--white,#f5f5f5)]/50">
              Completion Rate
            </CardDescription>
            <CheckCircle2 className="size-4 text-[color:var(--gold,#d4af37)]" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-[color:var(--gold,#d4af37)]">
              {stats.completionRate}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Active tasks table */}
      <Card className="border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--charcoal,#1a1a1a)] ring-[color:var(--gold,#d4af37)]/10">
        <CardHeader>
          <CardTitle className="font-heading text-[color:var(--white,#f5f5f5)]">
            Active Tasks
          </CardTitle>
          <CardDescription>
            {activeTasks.length} task{activeTasks.length !== 1 ? "s" : ""} in progress
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeTasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--white,#f5f5f5)]/40">
              No active tasks. Assign a new task to begin.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--gold,#d4af37)]/10 text-left text-[color:var(--white,#f5f5f5)]/50">
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
                      className="border-b border-[color:var(--gold,#d4af37)]/5 transition-colors hover:bg-[color:var(--black,#0a0a0a)]/40"
                    >
                      <td className="py-3 pr-4">
                        <Link
                          href={`/dashboard/task/${task.id}`}
                          className="font-medium text-[color:var(--white,#f5f5f5)] hover:text-[color:var(--gold,#d4af37)]"
                        >
                          {task.title}
                        </Link>
                      </td>
                      <td className="py-3 pr-4 text-[color:var(--white,#f5f5f5)]/60">
                        {formatDeadline(task.deadline)}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={task.status} type="task" />
                      </td>
                      <td className="py-3 text-[color:var(--white,#f5f5f5)]/60">
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
      <Card className="border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--charcoal,#1a1a1a)] ring-[color:var(--gold,#d4af37)]/10">
        <CardHeader>
          <CardTitle className="font-heading text-[color:var(--white,#f5f5f5)]">
            Recent Submissions
          </CardTitle>
          <CardDescription>Latest proof awaiting your review</CardDescription>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <p className="py-8 text-center text-sm text-[color:var(--white,#f5f5f5)]/40">
              No submissions yet.
            </p>
          ) : (
            <div className="space-y-3">
              {submissions.slice(0, 8).map((submission) => (
                <Link
                  key={submission.id}
                  href={`/dashboard/submissions/${submission.id}`}
                  className={cn(
                    "flex items-center gap-4 rounded-lg border border-[color:var(--gold,#d4af37)]/10 p-4",
                    "transition-all duration-300 hover:border-[color:var(--gold,#d4af37)]/30 hover:bg-[color:var(--black,#0a0a0a)]/40"
                  )}
                >
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-[color:var(--purple,#2d1b69)]/30">
                    <ImageIcon className="size-5 text-[color:var(--gold,#d4af37)]/60" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[color:var(--white,#f5f5f5)]">
                      {submission.task?.title ?? "Submission"}
                    </p>
                    <p className="text-xs text-[color:var(--white,#f5f5f5)]/40">
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

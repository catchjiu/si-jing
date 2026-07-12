"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Flame, Target, CalendarClock } from "lucide-react"
import type { Punishment, SlaveDashboardStats, Task } from "@/lib/types"
import { formatDeadline, isOverdue } from "@/lib/format"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { StatusBadge } from "@/components/tasks/status-badge"
import { Countdown } from "@/components/tasks/countdown"
import { ContactRestrictionBanner } from "@/components/punishments/punishment-countdown"

interface SlaveDashboardProps {
  tasks: Task[]
  stats: SlaveDashboardStats
  activeContactRestriction?: Punishment | null
}

export function SlaveDashboard({
  tasks,
  stats,
  activeContactRestriction = null,
}: SlaveDashboardProps) {
  const router = useRouter()
  const activeTasks = tasks.filter(
    (t) => !["approved", "rejected"].includes(t.status)
  )

  const upcomingDeadlines = [...activeTasks].sort(
    (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime()
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl text-[color:var(--white,#f5f5f5)]">
          Your Duties
        </h1>
        <p className="mt-1 text-sm text-[color:var(--white,#f5f5f5)]/50">
          Active assignments and upcoming deadlines
        </p>
      </div>

      {activeContactRestriction && (
        <ContactRestrictionBanner
          punishment={activeContactRestriction}
          onExpired={() => router.refresh()}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-[color:var(--purple,#2d1b69)]/30 bg-[color:var(--charcoal,#1a1a1a)]">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Completion</CardDescription>
            <Target className="size-4 text-[color:var(--gold,#d4af37)]" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-[color:var(--gold,#d4af37)]">
              {stats.completionRate}%
            </p>
            <p className="mt-1 text-xs text-[color:var(--white,#f5f5f5)]/40">
              {stats.completed} of {stats.total} tasks
            </p>
          </CardContent>
        </Card>

        <Card className="border-[color:var(--purple,#2d1b69)]/30 bg-[color:var(--charcoal,#1a1a1a)]">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Streak</CardDescription>
            <Flame className="size-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-orange-400">
              {stats.streak}
            </p>
            <p className="mt-1 text-xs text-[color:var(--white,#f5f5f5)]/40">
              consecutive days
            </p>
          </CardContent>
        </Card>

        <Card className="border-[color:var(--purple,#2d1b69)]/30 bg-[color:var(--charcoal,#1a1a1a)]">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Active Tasks</CardDescription>
            <CalendarClock className="size-4 text-[color:var(--gold,#d4af37)]" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-[color:var(--white,#f5f5f5)]">
              {activeTasks.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 font-heading text-xl text-[color:var(--white,#f5f5f5)]">
          Active Tasks
        </h2>
        {activeTasks.length === 0 ? (
          <Card className="border-[color:var(--purple,#2d1b69)]/30 bg-[color:var(--charcoal,#1a1a1a)]">
            <CardContent className="py-12 text-center text-sm text-[color:var(--white,#f5f5f5)]/40">
              No active tasks. Await your Queen&apos;s command.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {activeTasks.map((task) => {
              const overdue = isOverdue(task.deadline)
              return (
                <Link key={task.id} href={`/dashboard/task/${task.id}`}>
                  <Card
                    className={cn(
                      "h-full border transition-all duration-300 hover:border-[color:var(--gold,#d4af37)]/40",
                      overdue
                        ? "border-red-500/40 bg-red-500/5"
                        : "border-[color:var(--purple,#2d1b69)]/30 bg-[color:var(--charcoal,#1a1a1a)]"
                    )}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="font-heading text-[color:var(--white,#f5f5f5)]">
                          {task.title}
                        </CardTitle>
                        <StatusBadge status={task.status} type="task" />
                      </div>
                      {task.description && (
                        <CardDescription className="line-clamp-2">
                          {task.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-[color:var(--white,#f5f5f5)]/40">
                            Deadline
                          </p>
                          <p
                            className={cn(
                              "text-sm",
                              overdue
                                ? "text-red-400"
                                : "text-[color:var(--white,#f5f5f5)]/70"
                            )}
                          >
                            {formatDeadline(task.deadline)}
                          </p>
                        </div>
                        <Countdown
                          deadline={task.deadline}
                          className={cn(
                            "text-right font-mono text-sm",
                            overdue
                              ? "text-red-400"
                              : "text-[color:var(--gold,#d4af37)]"
                          )}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      <Card className="border-[color:var(--purple,#2d1b69)]/30 bg-[color:var(--charcoal,#1a1a1a)]">
        <CardHeader>
          <CardTitle className="font-heading text-[color:var(--white,#f5f5f5)]">
            Upcoming Deadlines
          </CardTitle>
        </CardHeader>
        <CardContent>
          {upcomingDeadlines.length === 0 ? (
            <p className="py-4 text-center text-sm text-[color:var(--white,#f5f5f5)]/40">
              No upcoming deadlines.
            </p>
          ) : (
            <ul className="space-y-2">
              {upcomingDeadlines.map((task) => {
                const overdue = isOverdue(task.deadline)
                return (
                  <li key={task.id}>
                    <Link
                      href={`/dashboard/task/${task.id}`}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors",
                        overdue
                          ? "bg-red-500/10 text-red-400"
                          : "hover:bg-[color:var(--black,#0a0a0a)]/40"
                      )}
                    >
                      <span className="truncate font-medium">{task.title}</span>
                      <span className="shrink-0 text-xs">
                        {formatDeadline(task.deadline)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

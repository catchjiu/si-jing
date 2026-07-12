"use client"

import { useRouter } from "next/navigation"
import { Flame, Target, CalendarClock } from "lucide-react"
import type { Punishment, SlaveDashboardStats, Task } from "@/lib/types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import { ContactRestrictionBanner } from "@/components/punishments/punishment-countdown"
import { DayAgenda } from "@/components/tasks/day-agenda"
import { groupTasksByDay } from "@/lib/day-groups"

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
  const todayGroup = groupTasksByDay(activeTasks).find((g) => g.isToday)
  const todayLeft = todayGroup
    ? todayGroup.tasks.filter((t) => t.status !== "submitted").length
    : 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-3xl text-[color:var(--white,#f5f5f5)]">
          Your Duties
        </h1>
        <p className="mt-1 text-sm text-[color:var(--white,#f5f5f5)]/50">
          {todayLeft > 0
            ? `${todayLeft} to complete today`
            : todayGroup
              ? "Today's duties are in — await review or rest"
              : "Your schedule by day"}
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
            <CardDescription>Today</CardDescription>
            <CalendarClock className="size-4 text-[color:var(--gold,#d4af37)]" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-[color:var(--white,#f5f5f5)]">
              {todayGroup?.tasks.length ?? 0}
            </p>
            <p className="mt-1 text-xs text-[color:var(--white,#f5f5f5)]/40">
              due today
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 font-heading text-xl text-gold">Schedule</h2>
        <DayAgenda tasks={tasks} activeOnly />
      </div>
    </div>
  )
}

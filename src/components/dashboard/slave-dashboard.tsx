"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { Flame, Target, CalendarClock, HandHeart } from "lucide-react"
import type { Punishment, SlaveDashboardStats, Task } from "@/lib/types"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-heading text-2xl text-ivory sm:text-3xl">
          Your Duties
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
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

      <div className="flex justify-end">
        <Button
          asChild
          variant="outline"
          className="border-gold/35 text-gold hover:bg-gold/10"
        >
          <Link href="/dashboard/requests">
            <HandHeart className="mr-2 h-4 w-4" />
            Make a request
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <Card className="border-royal/30 bg-charcoal">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Completion</CardDescription>
            <Target className="size-4 text-gold" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-gold">
              {stats.completionRate}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.completed} of {stats.total} tasks
            </p>
          </CardContent>
        </Card>

        <Card className="border-royal/30 bg-charcoal">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Streak</CardDescription>
            <Flame className="size-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-orange-400">
              {stats.streak}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              consecutive days
            </p>
          </CardContent>
        </Card>

        <Card className="border-royal/30 bg-charcoal">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Today</CardDescription>
            <CalendarClock className="size-4 text-gold" />
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl text-ivory">
              {todayGroup?.tasks.length ?? 0}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">due today</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 font-heading text-lg text-gold sm:mb-4 sm:text-xl">
          Schedule
        </h2>
        <DayAgenda tasks={tasks} activeOnly />
      </div>
    </div>
  )
}

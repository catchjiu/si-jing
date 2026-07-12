"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  AlarmClock,
  BookOpen,
  Flame,
  HandHeart,
  Sparkles,
  Target,
  CalendarClock,
} from "lucide-react"
import type { Punishment, SlaveDashboardStats, Task } from "@/lib/types"
import { formatDeadline, formatRelative } from "@/lib/format"
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
  activePunishments?: Punishment[]
  /** @deprecated use activePunishments */
  activeContactRestriction?: Punishment | null
}

export function SlaveDashboard({
  tasks,
  stats,
  activePunishments,
  activeContactRestriction = null,
}: SlaveDashboardProps) {
  const router = useRouter()
  const punishments =
    activePunishments ??
    (activeContactRestriction ? [activeContactRestriction] : [])
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

      {punishments.map((p) => (
        <ContactRestrictionBanner
          key={p.id}
          punishment={p}
          onExpired={() => router.refresh()}
        />
      ))}

      {(stats.unackedRules > 0 || stats.openCheckIns > 0) && (
        <div className="flex flex-wrap gap-2">
          {stats.unackedRules > 0 && (
            <Button asChild className="bg-gold text-void hover:bg-gold-muted">
              <Link href="/dashboard/protocol">
                <BookOpen className="mr-2 h-4 w-4" />
                Acknowledge {stats.unackedRules} rule
                {stats.unackedRules === 1 ? "" : "s"}
              </Link>
            </Button>
          )}
          {stats.openCheckIns > 0 && (
            <Button
              asChild
              variant="outline"
              className="border-gold/40 text-gold hover:bg-gold/10"
            >
              <Link href="/dashboard/check-ins">
                <AlarmClock className="mr-2 h-4 w-4" />
                {stats.openCheckIns} open check-in
                {stats.openCheckIns === 1 ? "" : "s"}
              </Link>
            </Button>
          )}
        </div>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
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
              {stats.completed} of {stats.total} today
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

        <Card className="border-royal/30 bg-charcoal">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Protocol</CardDescription>
            <BookOpen className="size-4 text-gold" />
          </CardHeader>
          <CardContent>
            <Link
              href="/dashboard/protocol"
              className="font-heading text-3xl text-gold hover:underline"
            >
              {stats.unackedRules}
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.lastRulesAckAt
                ? `Last ack ${formatRelative(stats.lastRulesAckAt)}`
                : "unacknowledged"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-royal/30 bg-charcoal">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardDescription>Next tease</CardDescription>
            <Sparkles className="size-4 text-gold" />
          </CardHeader>
          <CardContent>
            {stats.nextTeaseUnlockAt ? (
              <>
                <Link
                  href="/dashboard/teases"
                  className="font-heading text-lg text-gold hover:underline"
                >
                  {formatDeadline(stats.nextTeaseUnlockAt)}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">unlocks</p>
              </>
            ) : (
              <p className="font-heading text-lg text-muted-foreground">None</p>
            )}
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

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
import type {
  Punishment,
  QueenAvailability,
  SlaveDashboardStats,
  Task,
} from "@/lib/types"
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
import { MoodPicker } from "@/components/mood/mood-picker"
import { QueenStatusDisplay } from "@/components/status/queen-status"
import { PartnerLocalCard } from "@/components/dashboard/partner-local-card"
import { QueenReturnsCountdown } from "@/components/dashboard/queen-returns-countdown"
import { AttentionBudgetPanel } from "@/components/attention/attention-budget-panel"
import { StreakMilestonesPanel } from "@/components/streaks/streak-milestones-panel"
import { DashboardActivityPanel } from "@/components/dashboard/dashboard-activity-panel"
import { InboxUnreadBanner } from "@/components/inbox/inbox-unread-banner"
import { LastCumCounter } from "@/components/dashboard/last-cum-counter"
import type { ActivityItem } from "@/lib/activity"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { StatusBadge } from "@/components/tasks/status-badge"

interface SlaveDashboardProps {
  tasks: Task[]
  stats: SlaveDashboardStats
  activePunishments?: Punishment[]
  queenAvailability?: QueenAvailability | null
  queenStatusUpdatedAt?: string | null
  queenLastActiveAt?: string | null
  queenUsername?: string
  queenId?: string | null
  activity: ActivityItem[]
  /** @deprecated use activePunishments */
  activeContactRestriction?: Punishment | null
}

export function SlaveDashboard({
  tasks,
  stats,
  activePunishments,
  queenAvailability = null,
  queenStatusUpdatedAt = null,
  queenLastActiveAt = null,
  queenUsername = "Queen",
  queenId = null,
  activity,
  activeContactRestriction = null,
}: SlaveDashboardProps) {
  const router = useRouter()
  const punishments =
    activePunishments ??
    (activeContactRestriction ? [activeContactRestriction] : [])
  const activeTasks = tasks.filter(
    (t) => !["approved", "rejected"].includes(t.status)
  )
  const queenVerdicts = tasks
    .filter((t) => t.status === "rejected")
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    )
  const todayGroup = groupTasksByDay(activeTasks).find((g) => g.isToday)
  const todayLeft = todayGroup
    ? todayGroup.tasks.filter((t) => t.status !== "submitted").length
    : 0
  const needsAttention =
    stats.unackedRules > 0 ||
    stats.openCheckIns > 0 ||
    queenVerdicts.length > 0

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

      <InboxUnreadBanner />

      <DashboardActivityPanel
        role="slave"
        initialItems={activity}
        otherPartyName={queenUsername}
      />

      {punishments.map((p) => (
        <ContactRestrictionBanner
          key={p.id}
          punishment={p}
          onExpired={() => router.refresh()}
        />
      ))}

      <QueenStatusDisplay
        queenId={queenId}
        availability={queenAvailability}
        updatedAt={queenStatusUpdatedAt}
        lastActiveAt={queenLastActiveAt}
        username={queenUsername}
      />

      <PartnerLocalCard placeId="queen" />

      <QueenReturnsCountdown />

      <AttentionBudgetPanel />

      <MoodPicker />

      <StreakMilestonesPanel currentStreak={stats.streak} />

      {needsAttention && (
        <div className="space-y-3 rounded-xl border border-gold/30 bg-gold/8 p-4">
          <p className="font-heading text-lg text-gold">From {queenUsername}</p>
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
            {queenVerdicts.length > 0 && (
              <Button
                asChild
                variant="outline"
                className="border-gold/40 text-gold hover:bg-gold/10"
              >
                <Link href="/dashboard/tasks">
                  <Target className="mr-2 h-4 w-4" />
                  {queenVerdicts.length} rejected task
                  {queenVerdicts.length === 1 ? "" : "s"}
                </Link>
              </Button>
            )}
          </div>
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

        <LastCumCounter />
      </div>

      {queenVerdicts.length > 0 && (
        <section>
          <h2 className="mb-3 font-heading text-lg text-gold sm:mb-4 sm:text-xl">
            Rejected — resubmit
          </h2>
          <ul className="space-y-2">
            {queenVerdicts.slice(0, 5).map((task) => (
              <li key={task.id}>
                <Link
                  href={`/dashboard/task/${task.id}`}
                  className="flex items-center gap-3 rounded-xl border border-red-500/35 bg-red-950/20 px-3 py-3 transition-colors hover:border-red-500/50 sm:px-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-ivory">
                        {task.title}
                      </p>
                      <Badge
                        variant="outline"
                        className="border-red-500/50 px-1.5 py-0 text-[9px] uppercase tracking-wider text-red-300"
                      >
                        Needs resubmit
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Updated {formatRelative(task.updated_at)}
                    </p>
                  </div>
                  <StatusBadge status={task.status} type="task" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div>
        <h2 className="mb-3 font-heading text-lg text-gold sm:mb-4 sm:text-xl">
          Schedule
        </h2>
        <DayAgenda tasks={tasks} activeOnly />
      </div>
    </div>
  )
}

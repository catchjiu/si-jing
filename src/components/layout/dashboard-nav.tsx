"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ListTodo,
  User,
  LogOut,
  Menu,
  X,
  Gift,
  Ban,
  HandHeart,
  BookOpen,
  AlarmClock,
  Images,
  Sparkles,
  CalendarHeart,
  Heart,
  Crown,
  NotebookPen,
  Inbox,
  Store,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { SignedAvatarImage } from "@/components/ui/signed-avatar-image"
import { Separator } from "@/components/ui/separator"
import { BrandLogo } from "@/components/brand-logo"
import { NotificationBell } from "@/components/layout/notification-bell"
import {
  useInboxUnread,
} from "@/components/inbox/use-inbox-unread"
import {
  attachmentHref,
  NAV_TOPIC_BY_HREF,
  type MessageAttachmentType,
  type TopicThreadSummary,
} from "@/lib/inbox"

function featureNavHref(
  href: string,
  threads: TopicThreadSummary[]
): string {
  const topic = NAV_TOPIC_BY_HREF[href]
  if (!topic) return href
  const thread = threads.find((t) => t.topic === topic)
  if (!thread || thread.unread <= 0) return href
  const m = thread.lastMessage
  if (
    m?.attachment_type &&
    m.attachment_id &&
    (m.attachment_type === "tease" || m.attachment_type === "worship")
  ) {
    return attachmentHref(
      m.attachment_type as MessageAttachmentType,
      m.attachment_id,
      m.attachment_anchor
    )
  }
  return `/dashboard/inbox/${thread.conversationId}`
}

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox },
  { href: "/dashboard/tasks", label: "Tasks", icon: ListTodo },
  { href: "/dashboard/protocol", label: "Protocol", icon: BookOpen },
  { href: "/dashboard/check-ins", label: "Check-ins", icon: AlarmClock },
  { href: "/dashboard/teases", label: "Teases", icon: Sparkles },
  { href: "/dashboard/dates", label: "Dates", icon: CalendarHeart },
  { href: "/dashboard/evidence", label: "Evidence", icon: Images },
  { href: "/dashboard/rewards", label: "Rewards", icon: Gift },
  { href: "/dashboard/shop", label: "Shop", icon: Store },
  { href: "/dashboard/wishlist", label: "Wishlist", icon: Heart },
  { href: "/dashboard/worship", label: "Worship", icon: Crown },
  { href: "/dashboard/journal", label: "Journal", icon: NotebookPen },
  { href: "/dashboard/requests", label: "Requests", icon: HandHeart },
  { href: "/dashboard/punishments", label: "Punishments", icon: Ban },
  { href: "/dashboard/profile", label: "Profile", icon: User },
]

function InboxBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-semibold text-void">
      {count > 9 ? "9+" : count}
    </span>
  )
}

function TopicBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-gold/90 px-1.5 text-[10px] font-semibold text-void">
      {count > 9 ? "9+" : count}
    </span>
  )
}

export function DashboardNav() {
  const pathname = usePathname()
  const { profile, role, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const unread = useInboxUnread()
  const unreadTotal = unread.total

  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const initials = profile?.username
    ?.split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "?"

  const brandBlock = (
    <div className="flex items-center gap-3 px-4 py-5">
      <BrandLogo size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-lg text-ivory">Queen Sisi</p>
        <p className="text-xs text-muted-foreground">Private Chamber</p>
      </div>
      <NotificationBell className="hidden shrink-0 lg:inline-flex" />
    </div>
  )

  const profileBlock = profile ? (
    <div className="flex items-center gap-3 px-4 py-4">
      <Avatar size="sm">
        <SignedAvatarImage
          avatarUrl={profile.avatar_url}
          alt={profile.username}
        />
        <AvatarFallback className="bg-royal text-gold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ivory">
          {profile.username}
        </p>
        <Badge
          variant="outline"
          className={cn(
            "mt-0.5 border text-[10px] uppercase tracking-wider",
            role === "queen"
              ? "border-gold/50 bg-gold/10 text-gold"
              : "border-royal/60 bg-royal/30 text-ivory/80"
          )}
        >
          {role}
        </Badge>
      </div>
    </div>
  ) : null

  const navLinksBlock = (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {navLinks.map(({ href, label, icon: Icon }) => {
        const isActive =
          pathname === href ||
          (href !== "/dashboard" && pathname.startsWith(href))
        const isInbox = href === "/dashboard/inbox"
        const topic = NAV_TOPIC_BY_HREF[href]
        const topicUnread = topic ? unread.byTopic[topic] ?? 0 : 0
        const linkHref = featureNavHref(href, unread.threads)

        return (
          <Link
            key={href}
            href={linkHref}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-300",
              isActive
                ? "border border-gold/30 bg-gold/10 text-gold"
                : "text-ivory/60 hover:bg-charcoal hover:text-ivory"
            )}
          >
            <Icon className="size-4 shrink-0" />
            {label}
            {isInbox && <InboxBadge count={unreadTotal} />}
            {!isInbox && <TopicBadge count={topicUnread} />}
          </Link>
        )
      })}
    </nav>
  )

  const signOutBlock = (
    <div className="px-3 pb-4 pt-2">
      <Button
        variant="ghost"
        className="w-full justify-start gap-3 text-ivory/60 hover:bg-red-500/10 hover:text-red-400"
        onClick={() => {
          setMobileOpen(false)
          void signOut()
        }}
      >
        <LogOut className="size-4" />
        Sign out
      </Button>
    </div>
  )

  const sidebarBody = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0">
        {brandBlock}
        <Separator className="bg-gold/10" />
        {profileBlock}
        <Separator className="bg-gold/10" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {navLinksBlock}
      </div>
      <div className="shrink-0 border-t border-gold/10">{signOutBlock}</div>
    </div>
  )

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 w-full shrink-0 items-center justify-between border-b border-gold/10 bg-void/95 px-4 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-2">
          <BrandLogo size="sm" />
          <span className="font-heading text-ivory">Queen Sisi</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="relative text-ivory"
            aria-label="Inbox"
          >
            <Link href="/dashboard/inbox">
              <Inbox className="size-5" />
              {unreadTotal > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold text-void">
                  {unreadTotal > 9 ? "9+" : unreadTotal}
                </span>
              )}
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-ivory"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex h-dvh w-[min(18rem,85vw)] flex-col border-r border-gold/10 bg-charcoal shadow-2xl animate-fade-in">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-gold/10 px-4">
              <span className="font-heading text-gold">Menu</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <X className="size-5" />
              </Button>
            </div>
            <div className="min-h-0 flex-1">{sidebarBody}</div>
          </aside>
        </div>
      )}

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-gold/10 bg-charcoal lg:flex">
        {sidebarBody}
      </aside>
    </>
  )
}

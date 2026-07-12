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
  Flame,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { BrandLogo } from "@/components/brand-logo"
import { NotificationBell } from "@/components/layout/notification-bell"

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/tasks", label: "Tasks", icon: ListTodo },
  { href: "/dashboard/protocol", label: "Protocol", icon: BookOpen },
  { href: "/dashboard/check-ins", label: "Check-ins", icon: AlarmClock },
  { href: "/dashboard/rituals", label: "Rituals", icon: Flame },
  { href: "/dashboard/teases", label: "Teases", icon: Sparkles },
  { href: "/dashboard/evidence", label: "Evidence", icon: Images },
  { href: "/dashboard/rewards", label: "Rewards", icon: Gift },
  { href: "/dashboard/requests", label: "Requests", icon: HandHeart },
  { href: "/dashboard/punishments", label: "Punishments", icon: Ban },
  { href: "/dashboard/profile", label: "Profile", icon: User },
]

export function DashboardNav() {
  const pathname = usePathname()
  const { profile, role, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (!mobileOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileOpen])

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const initials = profile?.username
    ?.split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "?"

  const navContent = (
    <>
      <div className="flex items-center gap-3 px-4 py-5">
        <BrandLogo size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-lg text-ivory">Queen Sisi</p>
          <p className="text-xs text-muted-foreground">Private Chamber</p>
        </div>
      </div>

      <Separator className="bg-gold/10" />

      {profile && (
        <div className="flex items-center gap-3 px-4 py-4">
          <Avatar size="sm">
            {profile.avatar_url && (
              <AvatarImage src={profile.avatar_url} alt={profile.username} />
            )}
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
      )}

      <Separator className="bg-gold/10" />

      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Alerts
        </p>
        <NotificationBell />
      </div>

      <Separator className="bg-gold/10" />

      <nav className="flex flex-col gap-1 px-3 py-4">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href))

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-300",
                isActive
                  ? "border border-gold/30 bg-gold/10 text-gold"
                  : "text-ivory/60 hover:bg-charcoal hover:text-ivory"
              )}
            >
              <Icon className="size-4 shrink-0" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto px-3 pb-4">
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
    </>
  )

  return (
    <>
      {/* Mobile top bar — full width, not a side column */}
      <header className="sticky top-0 z-40 flex h-14 w-full shrink-0 items-center justify-between border-b border-gold/10 bg-void/95 px-4 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-2">
          <BrandLogo size="sm" />
          <span className="font-heading text-ivory">Queen Sisi</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell />
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

      {/* Mobile drawer portal-like overlay (not a flex sibling that steals width) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,85vw)] flex-col border-r border-gold/10 bg-charcoal shadow-2xl animate-fade-in">
            <div className="flex h-14 items-center justify-between border-b border-gold/10 px-4">
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
            <ScrollArea className="flex-1">
              <div className="flex min-h-full flex-col">{navContent}</div>
            </ScrollArea>
          </aside>
        </div>
      )}

      {/* Desktop sidebar only */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-gold/10 bg-charcoal lg:flex">
        <ScrollArea className="h-screen">
          <div className="flex min-h-screen flex-col">{navContent}</div>
        </ScrollArea>
      </aside>
    </>
  )
}

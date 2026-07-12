"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  ListTodo,
  User,
  LogOut,
  Menu,
  X,
  Crown,
  Gift,
  Ban,
} from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"

const navLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/tasks", label: "Tasks", icon: ListTodo },
  { href: "/dashboard/rewards", label: "Rewards", icon: Gift },
  { href: "/dashboard/punishments", label: "Punishments", icon: Ban },
  { href: "/dashboard/profile", label: "Profile", icon: User },
]

export function DashboardNav() {
  const pathname = usePathname()
  const { profile, role, signOut } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const initials = profile?.username
    ?.split(" ")
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "?"

  const navContent = (
    <>
      <div className="flex items-center gap-3 px-4 py-6">
        <div className="flex size-10 items-center justify-center rounded-full border border-[color:var(--gold,#d4af37)]/40 bg-[color:var(--purple,#2d1b69)]/30">
          <Crown className="size-5 text-[color:var(--gold,#d4af37)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-lg text-[color:var(--white,#f5f5f5)]">
            Queen Sisi
          </p>
          <p className="text-xs text-[color:var(--white,#f5f5f5)]/50">
            Private Chamber
          </p>
        </div>
      </div>

      <Separator className="bg-[color:var(--gold,#d4af37)]/10" />

      {profile && (
        <div className="flex items-center gap-3 px-4 py-4">
          <Avatar size="sm">
            {profile.avatar_url && (
              <AvatarImage src={profile.avatar_url} alt={profile.username} />
            )}
            <AvatarFallback className="bg-[color:var(--purple,#2d1b69)] text-[color:var(--gold,#d4af37)]">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[color:var(--white,#f5f5f5)]">
              {profile.username}
            </p>
            <Badge
              variant="outline"
              className={cn(
                "mt-0.5 border text-[10px] uppercase tracking-wider",
                role === "queen"
                  ? "border-[color:var(--gold,#d4af37)]/50 bg-[color:var(--gold,#d4af37)]/10 text-[color:var(--gold,#d4af37)]"
                  : "border-[color:var(--purple,#2d1b69)]/60 bg-[color:var(--purple,#2d1b69)]/30 text-[color:var(--white,#f5f5f5)]/80"
              )}
            >
              {role}
            </Badge>
          </div>
        </div>
      )}

      <Separator className="bg-[color:var(--gold,#d4af37)]/10" />

      <nav className="flex flex-col gap-1 px-3 py-4">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href))

          return (
            <Link
              key={href}
              href={href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-300",
                isActive
                  ? "border border-[color:var(--gold,#d4af37)]/30 bg-[color:var(--gold,#d4af37)]/10 text-[color:var(--gold,#d4af37)]"
                  : "text-[color:var(--white,#f5f5f5)]/60 hover:bg-[color:var(--charcoal,#1a1a1a)] hover:text-[color:var(--white,#f5f5f5)]"
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
          className="w-full justify-start gap-3 text-[color:var(--white,#f5f5f5)]/60 hover:bg-red-500/10 hover:text-red-400"
          onClick={() => {
            setMobileOpen(false)
            signOut()
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
      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-[color:var(--gold,#d4af37)]/10 bg-[color:var(--black,#0a0a0a)]/95 px-4 backdrop-blur-md lg:hidden">
        <div className="flex items-center gap-2">
          <Crown className="size-5 text-[color:var(--gold,#d4af37)]" />
          <span className="font-heading text-[color:var(--white,#f5f5f5)]">
            Queen Sisi
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-[color:var(--white,#f5f5f5)]"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </Button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[color:var(--gold,#d4af37)]/10 bg-[color:var(--charcoal,#1a1a1a)] transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <ScrollArea className="flex-1">{navContent}</ScrollArea>
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[color:var(--gold,#d4af37)]/10 bg-[color:var(--charcoal,#1a1a1a)] lg:flex">
        {navContent}
      </aside>
    </>
  )
}

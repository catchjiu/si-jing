"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import type { AppNotification } from "@/lib/inbox";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Global Updates control — server Alerts, not localStorage activity. */
export function NotificationBell({ className }: { className?: string }) {
  const { profile } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    try {
      const notes = await fetchNotifications(supabase, profile.id, 12);
      setItems(notes);
      setUnread(notes.filter((n) => !n.read_at).length);
    } catch {
      // best-effort
    }
  }, [profile]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!profile) return;
    let debounce: number | null = null;
    const schedule = () => {
      if (debounce != null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        debounce = null;
        void load();
      }, 400);
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`updates-bell:${profile.id}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${profile.id}`,
        },
        schedule
      )
      .subscribe();
    return () => {
      if (debounce != null) window.clearTimeout(debounce);
      void supabase.removeChannel(channel);
    };
  }, [profile, load]);

  const markAll = async () => {
    if (!profile) return;
    const supabase = createClient();
    await markAllNotificationsRead(supabase, profile.id);
    setItems((prev) =>
      prev.map((n) => ({
        ...n,
        read_at: n.read_at ?? new Date().toISOString(),
      }))
    );
    setUnread(0);
  };

  if (!profile) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("relative text-ivory hover:text-gold", className)}
          aria-label="Updates"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold text-void">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(20rem,calc(100vw-2rem))] border-gold/20 bg-charcoal p-0"
      >
        <DropdownMenuLabel className="flex items-center justify-between px-3 py-2.5 font-heading text-gold">
          Updates
          {unread > 0 && (
            <span className="text-[10px] font-normal text-gold/80">
              {unread} new
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gold/10" />
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing new yet.
          </p>
        ) : (
          items.map((n) => (
            <DropdownMenuItem
              key={n.id}
              asChild
              className="cursor-pointer rounded-none px-0 py-0 focus:bg-gold/10"
            >
              <Link
                href={n.href}
                className={cn(
                  "block w-full px-3 py-2.5 outline-none",
                  !n.read_at && "bg-gold/5"
                )}
                onClick={() => {
                  if (!n.read_at) {
                    const supabase = createClient();
                    void markNotificationRead(supabase, n.id);
                    setItems((prev) =>
                      prev.map((x) =>
                        x.id === n.id
                          ? { ...x, read_at: new Date().toISOString() }
                          : x
                      )
                    );
                    setUnread((u) => Math.max(0, u - 1));
                  }
                  setOpen(false);
                }}
              >
                <p className="text-sm text-ivory">{n.title}</p>
                {n.body && (
                  <p className="truncate text-xs text-muted-foreground">
                    {n.body}
                  </p>
                )}
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatRelative(n.created_at)}
                </p>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator className="bg-gold/10" />
        <div className="flex gap-1 p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1 text-gold hover:bg-gold/10"
            onClick={() => void markAll()}
            disabled={unread === 0}
          >
            Mark all read
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="flex-1 text-muted-foreground hover:bg-gold/10"
            asChild
          >
            <Link href="/dashboard/inbox" onClick={() => setOpen(false)}>
              Open Inbox
            </Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import {
  ACTIVITY_COUNT_LIMIT,
  countUnseen,
  fetchRecentActivity,
  getActivitySeenAt,
  markActivitySeen,
  type ActivityItem,
} from "@/lib/activity";
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

export function NotificationBell({ className }: { className?: string }) {
  const { profile, role } = useAuth();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [unseen, setUnseen] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!profile || !role) return;
    const supabase = createClient();
    const feed = await fetchRecentActivity(
      supabase,
      { id: profile.id, role },
      ACTIVITY_COUNT_LIMIT
    );
    setItems(feed.slice(0, 10));
    setUnseen(countUnseen(feed, getActivitySeenAt()));
  }, [profile, role]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    const onSeen = () => {
      setUnseen(0);
      void load();
    };
    window.addEventListener("activity-seen", onSeen);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("activity-seen", onSeen);
    };
  }, [load]);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
  };

  const markAllSeen = () => {
    markActivitySeen();
    setUnseen(0);
    setOpen(false);
  };

  if (!profile) return null;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("relative text-ivory hover:text-gold", className)}
          aria-label="Notifications"
        >
          <Bell className="size-5" />
          {unseen > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold text-void">
              {unseen > 9 ? "9+" : unseen}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(20rem,calc(100vw-2rem))] border-gold/20 bg-charcoal p-0"
      >
        <DropdownMenuLabel className="px-3 py-2.5 font-heading text-gold">
          Recent activity
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-gold/10" />
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nothing new yet.
          </p>
        ) : (
          items.map((item) => (
            <DropdownMenuItem
              key={item.id}
              asChild
              className="cursor-pointer rounded-none px-0 py-0 focus:bg-gold/10"
            >
              <Link
                href={item.href}
                className="block w-full px-3 py-2.5 outline-none"
              >
                <p className="text-sm text-ivory">{item.title}</p>
                {item.body && (
                  <p className="truncate text-xs text-muted-foreground">
                    {item.body}
                  </p>
                )}
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatRelative(item.at)}
                </p>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator className="bg-gold/10" />
        <div className="p-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-gold hover:bg-gold/10"
            onClick={markAllSeen}
            disabled={unseen === 0}
          >
            Mark all as seen
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

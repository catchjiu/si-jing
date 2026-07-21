"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  Ban,
  BellRing,
  Building2,
  CheckCircle2,
  BookOpen,
  ClipboardList,
  Gift,
  Crown,
  HandHeart,
  Heart,
  ImageIcon,
  Lock,
  MessageSquare,
  Mic,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import {
  ACTIVITY_COUNT_LIMIT,
  countUnseen,
  fetchRecentActivity,
  filterUnseenActivity,
  getActivitySeenAt,
  isActivityUnseen,
  markActivitySeen,
  markActivitySeenUpTo,
  type ActivityItem,
} from "@/lib/activity";
import type { UserRole } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const KIND_ICONS: Record<string, typeof BellRing> = {
  submission: Upload,
  request: HandHeart,
  request_message: MessageSquare,
  request_comment: MessageSquare,
  request_reply: HandHeart,
  directive: BellRing,
  check_in: AlarmClock,
  check_in_missed: AlarmClock,
  check_in_open: AlarmClock,
  punishment: Ban,
  punishment_pending: Ban,
  tease_new: Sparkles,
  tease_revealed: Sparkles,
  tease_viewed: Sparkles,
  tease_capture: Sparkles,
  tease_reaction_video: Video,
  tease_message: MessageSquare,
  tease_comment: MessageSquare,
  reward: Gift,
  reward_viewed: Gift,
  reward_message: MessageSquare,
  reward_comment: MessageSquare,
  date_new: Heart,
  date_reaction: Heart,
  date_comment: Heart,
  task: ClipboardList,
  task_started: ClipboardList,
  task_submitted: Upload,
  review: CheckCircle2,
  rule: ClipboardList,
  location_request: MessageSquare,
  location_shared: MessageSquare,
  voice_note: Mic,
  journal_comment: BookOpen,
  journal_entry: BookOpen,
  submission_comment: MessageSquare,
  wishlist: Gift,
  wishlist_add: Gift,
  wishlist_gift_add: Gift,
  wishlist_comment: MessageSquare,
  wishlist_note: MessageSquare,
  wishlist_seen: Gift,
  wishlist_status: Gift,
  worship: Crown,
  worship_add: Crown,
  worship_gallery_add: Crown,
  worship_gallery_viewed: Crown,
  worship_comment: MessageSquare,
  worship_viewed: Crown,
  inbox_message: MessageSquare,
  inbox_voice: Mic,
  apartment_fund: Building2,
  denial_edge: Lock,
  denial_comment: MessageSquare,
};

function iconForKind(kind: string) {
  return KIND_ICONS[kind] ?? BellRing;
}

interface DashboardActivityPanelProps {
  role: UserRole;
  initialItems: ActivityItem[];
  otherPartyName?: string;
  className?: string;
}

export function DashboardActivityPanel({
  role,
  initialItems,
  otherPartyName = role === "queen" ? "D" : "Queen",
  className,
}: DashboardActivityPanelProps) {
  const { profile } = useAuth();
  const [items, setItems] = useState(initialItems);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const refresh = useCallback(async () => {
    if (!profile) return;
    const supabase = createClient();
    const feed = await fetchRecentActivity(
      supabase,
      { id: profile.id, role },
      ACTIVITY_COUNT_LIMIT
    );
    setItems(feed);
  }, [profile, role]);

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  useEffect(() => {
    setSeenAt(getActivitySeenAt());
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    const onSeen = () => {
      setSeenAt(getActivitySeenAt());
      setDismissed(true);
    };
    window.addEventListener("activity-seen", onSeen);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("activity-seen", onSeen);
    };
  }, [refresh]);

  const unseen = countUnseen(items, seenAt);
  const showBanner = unseen > 0 && !dismissed;
  const visibleItems = filterUnseenActivity(items, seenAt).slice(0, 10);

  const dismiss = () => {
    const now = new Date().toISOString();
    markActivitySeen(now);
    setSeenAt(now);
    setDismissed(true);
  };

  const onItemClick = (item: ActivityItem) => {
    markActivitySeenUpTo(item.at);
    setSeenAt((prev) => {
      if (!prev || new Date(item.at).getTime() > new Date(prev).getTime()) {
        return item.at;
      }
      return prev;
    });
  };

  if (visibleItems.length === 0 && !showBanner) {
    return null;
  }

  return (
    <section className={cn("space-y-3", className)}>
      {showBanner && (
        <div className="flex flex-col gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-gold/50 bg-gold/15">
              <BellRing className="size-4 text-gold" />
              <span className="absolute -right-0.5 -top-0.5 size-2.5 animate-pulse rounded-full bg-gold" />
            </span>
            <div>
              <p className="font-heading text-lg text-gold">
                {unseen} new from {otherPartyName}
              </p>
              <p className="text-sm text-ivory/80">
                {role === "queen"
                  ? "D has taken action — review what needs your attention."
                  : "Queen has taken action — see what changed for you."}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={dismiss}
            className="shrink-0 border-gold/40 text-gold hover:bg-gold/10"
          >
            Mark all as seen
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-gold/20 bg-charcoal/80">
        <div className="flex items-center justify-between gap-3 border-b border-gold/10 px-4 py-3">
          <div>
            <h2 className="font-heading text-lg text-ivory sm:text-xl">
              From {otherPartyName}
            </h2>
            <p className="text-xs text-muted-foreground">
              Recent actions you should know about
            </p>
          </div>
          {unseen > 0 && (
            <Badge className="bg-gold text-void hover:bg-gold">
              {unseen} new
            </Badge>
          )}
        </div>

        {visibleItems.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nothing new from {otherPartyName} yet.
          </p>
        ) : (
          <ul className="divide-y divide-gold/10">
            {visibleItems.map((item) => {
              const Icon = iconForKind(item.kind);
              const isNew = isActivityUnseen(item, seenAt);
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => onItemClick(item)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-gold/5",
                      isNew && "border-l-4 border-l-gold bg-gold/[0.07]"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                        isNew
                          ? "border border-gold/40 bg-gold/15 text-gold"
                          : "border border-gold/15 bg-void/50 text-gold/70"
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={cn(
                            "text-sm",
                            isNew
                              ? "font-medium text-ivory"
                              : "text-ivory/90"
                          )}
                        >
                          {item.title}
                        </p>
                        {isNew && (
                          <Badge
                            variant="outline"
                            className="border-gold/50 px-1.5 py-0 text-[9px] uppercase tracking-wider text-gold"
                          >
                            New
                          </Badge>
                        )}
                      </div>
                      {item.body && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {item.body}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {formatRelative(item.at)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

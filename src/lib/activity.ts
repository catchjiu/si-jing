import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/types";

export type ActivityItem = {
  id: string;
  at: string;
  title: string;
  body?: string;
  href: string;
  kind: string;
};

type ProfileRef = { id: string; role: UserRole };

function pushItem(
  items: ActivityItem[],
  item: ActivityItem | null | undefined
) {
  if (item) items.push(item);
}

export async function fetchRecentActivity(
  supabase: SupabaseClient,
  profile: ProfileRef,
  limit = 5
): Promise<ActivityItem[]> {
  const items: ActivityItem[] = [];

  if (profile.role === "queen") {
    const [
      submissions,
      requests,
      messages,
      checkIns,
      punishments,
      teases,
      rewards,
      dates,
      teaseMessages,
      rewardMessages,
      locationRequests,
      voiceNotes,
    ] = await Promise.all([
      supabase
        .from("submissions")
        .select("id, status, submitted_at, task:tasks(title)")
        .order("submitted_at", { ascending: false })
        .limit(8),
      supabase
        .from("requests")
        .select("id, title, status, created_at, responded_at")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("request_messages")
        .select(
          "id, content, created_at, request_id, author:users!author_id(role, username)"
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("check_ins")
        .select("id, title, status, responded_at, closes_at, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("punishments")
        .select("id, title, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("teases")
        .select(
          "id, title, viewed_at, screenshot_flagged_at, unblurred_at, expired_at, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("rewards")
        .select("id, title, viewed_at, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("queen_dates")
        .select("id, title, reacted_at, scheduled_at, created_at")
        .not("reacted_at", "is", null)
        .order("reacted_at", { ascending: false })
        .limit(8),
      supabase
        .from("tease_messages")
        .select(
          "id, content, created_at, tease_id, author:users!author_id(role, username)"
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("reward_messages")
        .select(
          "id, content, created_at, reward_id, author:users!author_id(role, username)"
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("location_requests")
        .select("id, status, created_at, shared_at, requested_by, requested_from")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("voice_notes")
        .select(
          "id, entity_type, entity_id, created_at, created_by, author:users!created_by(role, username)"
        )
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    for (const s of submissions.data ?? []) {
      const taskTitle =
        (s.task as { title?: string } | null)?.title ?? "a task";
      pushItem(items, {
        id: `sub-${s.id}`,
        at: s.submitted_at as string,
        title: "New submission",
        body: taskTitle,
        href: `/dashboard/submissions/${s.id}`,
        kind: "submission",
      });
    }

    for (const r of requests.data ?? []) {
      pushItem(items, {
        id: `req-${r.id}`,
        at: r.created_at as string,
        title: "New request",
        body: r.title as string,
        href: "/dashboard/requests",
        kind: "request",
      });
    }

    for (const m of messages.data ?? []) {
      const author = m.author as { role?: string; username?: string } | null;
      if (author?.role === "queen") continue;
      pushItem(items, {
        id: `rmsg-${m.id}`,
        at: m.created_at as string,
        title: "Message from D",
        body: (m.content as string).slice(0, 80),
        href: "/dashboard/requests",
        kind: "request_message",
      });
    }

    for (const c of checkIns.data ?? []) {
      if (c.status === "completed" && c.responded_at) {
        pushItem(items, {
          id: `ci-done-${c.id}`,
          at: c.responded_at as string,
          title: "Check-in completed",
          body: c.title as string,
          href: "/dashboard/check-ins",
          kind: "check_in",
        });
      } else if (c.status === "missed") {
        pushItem(items, {
          id: `ci-miss-${c.id}`,
          at: (c.closes_at as string) || (c.created_at as string),
          title: "Check-in missed",
          body: c.title as string,
          href: "/dashboard/check-ins",
          kind: "check_in_missed",
        });
      }
    }

    for (const p of punishments.data ?? []) {
      pushItem(items, {
        id: `pun-pending-${p.id}`,
        at: p.created_at as string,
        title: "Pending punishment",
        body: (p.title as string) || "Needs confirmation",
        href: "/dashboard/punishments",
        kind: "punishment_pending",
      });
    }

    for (const t of teases.data ?? []) {
      if (t.screenshot_flagged_at) {
        pushItem(items, {
          id: `tease-cap-${t.id}`,
          at: t.screenshot_flagged_at as string,
          title: "Tease capture alert",
          body: (t.title as string) || "D may have left mid-view",
          href: "/dashboard/teases",
          kind: "tease_capture",
        });
      }
      if (t.viewed_at) {
        pushItem(items, {
          id: `tease-view-${t.id}`,
          at: t.viewed_at as string,
          title: "Tease viewed",
          body: (t.title as string) || "D opened a tease",
          href: "/dashboard/teases",
          kind: "tease_viewed",
        });
      }
    }

    for (const r of rewards.data ?? []) {
      if (r.viewed_at) {
        pushItem(items, {
          id: `rew-view-${r.id}`,
          at: r.viewed_at as string,
          title: "Reward opened",
          body: (r.title as string) || "D viewed a reward",
          href: "/dashboard/rewards",
          kind: "reward_viewed",
        });
      }
    }

    for (const d of dates.data ?? []) {
      if (!d.reacted_at) continue;
      pushItem(items, {
        id: `date-react-${d.id}`,
        at: d.reacted_at as string,
        title: "Date reaction",
        body: (d.title as string) || "D reacted to a date",
        href: "/dashboard/dates",
        kind: "date_reaction",
      });
    }

    for (const m of teaseMessages.data ?? []) {
      const author = m.author as { role?: string; username?: string } | null;
      if (author?.role === "queen") continue;
      pushItem(items, {
        id: `tmsg-${m.id}`,
        at: m.created_at as string,
        title: "Beg on tease",
        body: (m.content as string).slice(0, 80),
        href: "/dashboard/teases",
        kind: "tease_message",
      });
    }

    for (const m of rewardMessages.data ?? []) {
      const author = m.author as { role?: string; username?: string } | null;
      if (author?.role === "queen") continue;
      pushItem(items, {
        id: `rmsg-${m.id}`,
        at: m.created_at as string,
        title: "Comment on reward",
        body: (m.content as string).slice(0, 80),
        href: "/dashboard/rewards",
        kind: "reward_message",
      });
    }

    for (const loc of locationRequests.data ?? []) {
      if (loc.requested_from !== profile.id && loc.requested_by !== profile.id) {
        continue;
      }
      if (loc.status === "pending" && loc.requested_from === profile.id) {
        pushItem(items, {
          id: `loc-in-${loc.id}`,
          at: loc.created_at as string,
          title: "Location requested",
          body: "D wants your location",
          href: "/dashboard/requests",
          kind: "location_request",
        });
      } else if (loc.status === "shared" && loc.requested_by === profile.id) {
        pushItem(items, {
          id: `loc-shared-${loc.id}`,
          at: (loc.shared_at as string) || (loc.created_at as string),
          title: "Location shared",
          body: "D shared a pin",
          href: "/dashboard/requests",
          kind: "location_shared",
        });
      }
    }

    for (const v of voiceNotes.data ?? []) {
      const author = v.author as { role?: string; username?: string } | null;
      if (author?.role === "queen") continue;
      const href =
        v.entity_type === "date"
          ? "/dashboard/dates"
          : v.entity_type === "tease"
            ? "/dashboard/teases"
            : v.entity_type === "reward"
              ? "/dashboard/rewards"
              : "/dashboard";
      pushItem(items, {
        id: `voice-${v.id}`,
        at: v.created_at as string,
        title: "Voice from D",
        body:
          v.entity_type === "tease"
            ? "Voice beg on a tease"
            : v.entity_type === "date"
              ? "Voice on a date"
              : v.entity_type === "reward"
                ? "Voice on a reward"
                : "New voice message",
        href,
        kind: "voice_note",
      });
    }
  } else {
    const [
      tasks,
      submissions,
      rewards,
      punishments,
      requests,
      messages,
      checkIns,
      teases,
      rules,
      dates,
      teaseMessages,
      rewardMessages,
      locationRequests,
      voiceNotes,
    ] = await Promise.all([
      supabase
        .from("tasks")
        .select("id, title, status, created_at, updated_at, assigned_to, parent_task_id, is_recurring")
        .eq("assigned_to", profile.id)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("submissions")
        .select("id, status, submitted_at, feedback, task_id, task:tasks(title)")
        .eq("submitted_by", profile.id)
        .in("status", ["approved", "rejected"])
        .order("submitted_at", { ascending: false })
        .limit(8),
      supabase
        .from("rewards")
        .select("id, title, created_at, viewed_at")
        .eq("sent_to", profile.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("punishments")
        .select("id, title, status, created_at, starts_at")
        .eq("issued_to", profile.id)
        .in("status", ["active", "pending"])
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("requests")
        .select("id, title, status, queen_response, responded_at, created_at")
        .eq("requested_by", profile.id)
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase
        .from("request_messages")
        .select(
          "id, content, created_at, request_id, author:users!author_id(role, username)"
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("check_ins")
        .select("id, title, status, opens_at, created_at")
        .eq("assigned_to", profile.id)
        .eq("status", "open")
        .order("opens_at", { ascending: false })
        .limit(5),
      supabase
        .from("teases")
        .select(
          "id, title, is_blurred, unblurred_at, unlocks_at, expired_at, created_at"
        )
        .eq("sent_to", profile.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("rules")
        .select("id, title, created_at, is_active")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("queen_dates")
        .select("id, title, scheduled_at, created_at")
        .eq("assigned_to", profile.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("tease_messages")
        .select(
          "id, content, created_at, tease_id, author:users!author_id(role, username)"
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("reward_messages")
        .select(
          "id, content, created_at, reward_id, author:users!author_id(role, username)"
        )
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("location_requests")
        .select("id, status, created_at, shared_at, requested_by, requested_from")
        .or(`requested_by.eq.${profile.id},requested_from.eq.${profile.id}`)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("voice_notes")
        .select(
          "id, entity_type, entity_id, created_at, created_by, author:users!created_by(role, username)"
        )
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    for (const t of tasks.data ?? []) {
      // Skip recurring templates (shown via dated occurrences)
      if (t.is_recurring && !t.parent_task_id) continue;
      pushItem(items, {
        id: `task-${t.id}`,
        at: t.created_at as string,
        title: "New task",
        body: t.title as string,
        href: `/dashboard/task/${t.id}`,
        kind: "task",
      });
    }

    for (const s of submissions.data ?? []) {
      const taskTitle =
        (s.task as { title?: string } | null)?.title ?? "your submission";
      pushItem(items, {
        id: `rev-${s.id}`,
        at: s.submitted_at as string,
        title: s.status === "approved" ? "Submission approved" : "Submission rejected",
        body: taskTitle,
        href: `/dashboard/submissions/${s.id}`,
        kind: "review",
      });
    }

    for (const r of rewards.data ?? []) {
      pushItem(items, {
        id: `rew-${r.id}`,
        at: r.created_at as string,
        title: "New reward",
        body: (r.title as string) || "A gift from Queen",
        href: "/dashboard/rewards",
        kind: "reward",
      });
    }

    for (const p of punishments.data ?? []) {
      pushItem(items, {
        id: `pun-${p.id}`,
        at: (p.starts_at as string) || (p.created_at as string),
        title: p.status === "pending" ? "Suggested punishment" : "Punishment active",
        body: (p.title as string) || "Consequence issued",
        href: "/dashboard/punishments",
        kind: "punishment",
      });
    }

    for (const r of requests.data ?? []) {
      if (r.responded_at && r.queen_response) {
        pushItem(items, {
          id: `req-reply-${r.id}`,
          at: r.responded_at as string,
          title: `Request ${r.status}`,
          body: r.title as string,
          href: "/dashboard/requests",
          kind: "request_reply",
        });
      }
    }

    for (const m of messages.data ?? []) {
      const author = m.author as { role?: string; username?: string } | null;
      if (author?.role !== "queen") continue;
      pushItem(items, {
        id: `rmsg-${m.id}`,
        at: m.created_at as string,
        title: "Message from Queen",
        body: (m.content as string).slice(0, 80),
        href: "/dashboard/requests",
        kind: "request_message",
      });
    }

    for (const c of checkIns.data ?? []) {
      pushItem(items, {
        id: `ci-open-${c.id}`,
        at: (c.opens_at as string) || (c.created_at as string),
        title: "Check-in open",
        body: c.title as string,
        href: "/dashboard/check-ins",
        kind: "check_in_open",
      });
    }

    for (const t of teases.data ?? []) {
      if (t.expired_at) continue;
      if (!t.is_blurred && t.unblurred_at) {
        pushItem(items, {
          id: `tease-rev-${t.id}`,
          at: t.unblurred_at as string,
          title: "Tease revealed",
          body: (t.title as string) || "Queen revealed a tease",
          href: "/dashboard/teases",
          kind: "tease_revealed",
        });
      } else {
        pushItem(items, {
          id: `tease-new-${t.id}`,
          at: t.created_at as string,
          title: "New tease",
          body: (t.title as string) || "Something waiting for you",
          href: "/dashboard/teases",
          kind: "tease_new",
        });
      }
    }

    for (const rule of rules.data ?? []) {
      pushItem(items, {
        id: `rule-${rule.id}`,
        at: rule.created_at as string,
        title: "Protocol rule",
        body: rule.title as string,
        href: "/dashboard/protocol",
        kind: "rule",
      });
    }

    for (const d of dates.data ?? []) {
      pushItem(items, {
        id: `date-new-${d.id}`,
        at: d.created_at as string,
        title: "New date posted",
        body: (d.title as string) || "Queen scheduled a date",
        href: "/dashboard/dates",
        kind: "date_new",
      });
    }

    for (const m of teaseMessages.data ?? []) {
      const author = m.author as { role?: string; username?: string } | null;
      if (author?.role !== "queen") continue;
      pushItem(items, {
        id: `tmsg-${m.id}`,
        at: m.created_at as string,
        title: "Queen replied on tease",
        body: (m.content as string).slice(0, 80),
        href: "/dashboard/teases",
        kind: "tease_message",
      });
    }

    for (const m of rewardMessages.data ?? []) {
      const author = m.author as { role?: string; username?: string } | null;
      if (author?.role !== "queen") continue;
      pushItem(items, {
        id: `rmsg-${m.id}`,
        at: m.created_at as string,
        title: "Queen replied on reward",
        body: (m.content as string).slice(0, 80),
        href: "/dashboard/rewards",
        kind: "reward_message",
      });
    }

    for (const loc of locationRequests.data ?? []) {
      if (loc.status === "pending" && loc.requested_from === profile.id) {
        pushItem(items, {
          id: `loc-in-${loc.id}`,
          at: loc.created_at as string,
          title: "Location requested",
          body: "Queen wants your location",
          href: "/dashboard/requests",
          kind: "location_request",
        });
      } else if (loc.status === "shared" && loc.requested_by === profile.id) {
        pushItem(items, {
          id: `loc-shared-${loc.id}`,
          at: (loc.shared_at as string) || (loc.created_at as string),
          title: "Location shared",
          body: "Queen shared a pin",
          href: "/dashboard/requests",
          kind: "location_shared",
        });
      }
    }

    for (const v of voiceNotes.data ?? []) {
      const author = v.author as { role?: string; username?: string } | null;
      if (author?.role !== "queen") continue;
      const href =
        v.entity_type === "date"
          ? "/dashboard/dates"
          : v.entity_type === "tease"
            ? "/dashboard/teases"
            : v.entity_type === "reward"
              ? "/dashboard/rewards"
              : "/dashboard";
      pushItem(items, {
        id: `voice-${v.id}`,
        at: v.created_at as string,
        title: "Voice from Queen",
        body:
          v.entity_type === "tease"
            ? "Voice reply on a tease"
            : v.entity_type === "date"
              ? "Voice on a date"
              : v.entity_type === "reward"
                ? "Voice on a reward"
                : "New voice message",
        href,
        kind: "voice_note",
      });
    }
  }

  // Dedupe by id, sort newest first, take limit
  const seen = new Set<string>();
  return items
    .filter((i) => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

const SEEN_KEY = "queen-sisi:activity-seen-at";

export function getActivitySeenAt(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SEEN_KEY);
}

export function markActivitySeen(iso = new Date().toISOString()) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SEEN_KEY, iso);
}

export function countUnseen(items: ActivityItem[], seenAt: string | null) {
  if (!seenAt) return items.length;
  const t = new Date(seenAt).getTime();
  return items.filter((i) => new Date(i.at).getTime() > t).length;
}

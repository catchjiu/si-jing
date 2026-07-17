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

function isFromOtherParty(
  author:
    | { id?: string; role?: string; username?: string }
    | null
    | undefined,
  profile: ProfileRef
): boolean {
  if (!author?.id || author.id === profile.id) return false;
  if (profile.role === "queen") return author.role === "slave";
  return author.role === "queen";
}

const FETCH_LIMIT = 20;

function otherPartyLabel(profile: ProfileRef): string {
  return profile.role === "queen" ? "D" : "Queen";
}

function pushOtherPartyComment(
  items: ActivityItem[],
  profile: ProfileRef,
  opts: {
    id: string;
    at: string;
    content: string;
    where: string;
    href: string;
    kind: string;
    context?: string | null;
    author?: { id?: string; role?: string } | null;
  }
) {
  if (!isFromOtherParty(opts.author, profile)) return;
  const snippet = opts.content.trim().slice(0, 80);
  if (!snippet && !opts.context) return;
  pushItem(items, {
    id: opts.id,
    at: opts.at,
    title: `Comment on ${opts.where} · ${otherPartyLabel(profile)}`,
    body: opts.context
      ? `${opts.context.slice(0, 50)}${snippet ? ` — ${snippet}` : ""}`
      : snippet,
    href: opts.href,
    kind: opts.kind,
  });
}

/** Topic-thread DMs mirrored from comments — skip to avoid duplicates. */
const COMMENT_ATTACHMENT_TYPES = new Set([
  "request",
  "tease",
  "reward",
  "journal",
  "task",
  "submission",
  "date",
  "punishment",
  "wishlist",
  "worship",
]);

function pushOtherPartyAdd(
  items: ActivityItem[],
  profile: ProfileRef,
  opts: {
    id: string;
    at: string;
    where: string;
    body: string;
    href: string;
    kind: string;
    author?: { id?: string; role?: string } | null;
  }
) {
  if (!isFromOtherParty(opts.author, profile)) return;
  pushItem(items, {
    id: opts.id,
    at: opts.at,
    title: `Added to ${opts.where} · ${otherPartyLabel(profile)}`,
    body: opts.body,
    href: opts.href,
    kind: opts.kind,
  });
}

function voiceNoteHref(
  entityType: string,
  entityId: string | null | undefined
): string {
  if (entityType === "date") return "/dashboard/dates";
  if (entityType === "tease") return "/dashboard/teases";
  if (entityType === "reward") return "/dashboard/rewards";
  if (entityType === "journal") return "/dashboard/journal";
  if (entityType === "request") return "/dashboard/requests";
  if (entityType === "wishlist") return "/dashboard/wishlist";
  if (entityType === "worship") return "/dashboard/worship";
  if (entityType === "worship_gallery" && entityId) {
    return `/dashboard/worship/${entityId}`;
  }
  if (entityType === "submission" && entityId) {
    return `/dashboard/submissions/${entityId}`;
  }
  return "/dashboard";
}

export async function fetchRecentActivity(
  supabase: SupabaseClient,
  profile: ProfileRef,
  limit = 20
): Promise<ActivityItem[]> {
  const items: ActivityItem[] = [];

  if (profile.role === "queen") {
    const { data: slaveRow } = await supabase
      .from("users")
      .select("id")
      .eq("role", "slave")
      .limit(1)
      .maybeSingle();
    const slaveId = (slaveRow?.id as string | undefined) ?? undefined;

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
      slaveTasks,
      journalComments,
      journalEntries,
      submissionComments,
      wishlistItems,
      wishlistGiftItems,
      wishlistMessages,
      worshipGalleries,
      worshipEntries,
      worshipMessages,
      directMessages,
      datePosts,
      teaseViewCaptures,
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
          "id, content, created_at, request_id, author_id, author:users!author_id(id, role, username), request:requests(title)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
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
          "id, content, created_at, tease_id, author_id, author:users!author_id(id, role, username), tease:teases(title)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("reward_messages")
        .select(
          "id, content, created_at, reward_id, author_id, author:users!author_id(id, role, username), reward:rewards(title)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
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
      slaveId
        ? supabase
            .from("tasks")
            .select("id, title, status, started_at, updated_at")
            .eq("assigned_to", slaveId)
            .in("status", ["in_progress", "submitted"])
            .order("updated_at", { ascending: false })
            .limit(8)
        : Promise.resolve({ data: [] }),
      supabase
        .from("journal_comments")
        .select(
          "id, content, created_at, entry_id, author_id, author:users!author_id(id, role, username)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      slaveId
        ? supabase
            .from("journal_entries")
            .select("id, body, entry_date, visibility, created_at, author_id")
            .eq("visibility", "shared")
            .eq("author_id", slaveId)
            .order("created_at", { ascending: false })
            .limit(FETCH_LIMIT)
        : Promise.resolve({ data: [] }),
      supabase
        .from("comments")
        .select(
          "id, content, created_at, submission_id, commented_by, author:users!commented_by(id, role, username)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      slaveId
        ? supabase
            .from("wishlist_items")
            .select(
              "id, title, status, seen_at, fulfillment_notes, fulfilled_at, updated_at, created_at, created_by"
            )
            .eq("item_kind", "queen_taste")
            .or(
              "seen_at.not.is.null,fulfillment_notes.not.is.null,status.eq.ordered,status.eq.fulfilled"
            )
            .order("updated_at", { ascending: false })
            .limit(FETCH_LIMIT)
        : Promise.resolve({ data: [] }),
      slaveId
        ? supabase
            .from("wishlist_items")
            .select("id, title, created_at, created_by")
            .eq("item_kind", "slave_gift")
            .eq("created_by", slaveId)
            .order("created_at", { ascending: false })
            .limit(FETCH_LIMIT)
        : Promise.resolve({ data: [] }),
      supabase
        .from("wishlist_messages")
        .select(
          "id, content, created_at, wishlist_id, author_id, author:users!author_id(id, role, username), item:wishlist_items(title)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      slaveId
        ? supabase
            .from("worship_galleries")
            .select("id, topic, created_at, created_by")
            .eq("created_by", slaveId)
            .order("created_at", { ascending: false })
            .limit(FETCH_LIMIT)
        : Promise.resolve({ data: [] }),
      slaveId
        ? supabase
            .from("worship_entries")
            .select("id, title, love_level, gallery_id, created_at, created_by")
            .eq("created_by", slaveId)
            .order("created_at", { ascending: false })
            .limit(FETCH_LIMIT)
        : Promise.resolve({ data: [] }),
      supabase
        .from("worship_messages")
        .select(
          "id, content, created_at, worship_id, author_id, author:users!author_id(id, role, username), entry:worship_entries(title, gallery_id)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("direct_messages")
        .select(
          "id, content, created_at, sender_id, voice_path, media_type, attachment_type, attachment_id, sender:users!sender_id(id, role, username)"
        )
        .neq("sender_id", profile.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("date_posts")
        .select(
          "id, body, created_at, date_id, author_id, author:users!author_id(id, role, username), date:queen_dates(title)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("tease_view_captures")
        .select(
          "id, created_at, tease_id, viewer_id, duration_ms, tease:teases(title), viewer:users!viewer_id(id, role, username)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
    ]);

    for (const t of slaveTasks.data ?? []) {
      if (t.status === "in_progress" && t.started_at) {
        pushItem(items, {
          id: `task-start-${t.id}`,
          at: t.started_at as string,
          title: "D started a task",
          body: t.title as string,
          href: `/dashboard/task/${t.id}`,
          kind: "task_started",
        });
      } else if (t.status === "submitted") {
        pushItem(items, {
          id: `task-sub-${t.id}`,
          at: t.updated_at as string,
          title: "D submitted proof",
          body: t.title as string,
          href: `/dashboard/task/${t.id}`,
          kind: "task_submitted",
        });
      }
    }

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
      const request = m.request as { title?: string } | null;
      pushOtherPartyComment(items, profile, {
        id: `req-comment-${m.id}`,
        at: m.created_at as string,
        content: m.content as string,
        where: "request",
        href: "/dashboard/requests",
        kind: "request_comment",
        context: request?.title ?? null,
        author: m.author as { id?: string; role?: string } | null,
      });
    }

    for (const jc of journalComments.data ?? []) {
      pushOtherPartyComment(items, profile, {
        id: `journal-comment-${jc.id}`,
        at: jc.created_at as string,
        content: jc.content as string,
        where: "journal",
        href: "/dashboard/journal",
        kind: "journal_comment",
        author: jc.author as { id?: string; role?: string } | null,
      });
    }

    for (const je of journalEntries.data ?? []) {
      if (je.author_id === profile.id) continue;
      pushItem(items, {
        id: `journal-entry-${je.id}`,
        at: je.created_at as string,
        title: "New journal entry",
        body:
          (je.body as string).slice(0, 80) ||
          (je.entry_date as string) ||
          "Shared reflection",
        href: "/dashboard/journal",
        kind: "journal_entry",
      });
    }

    for (const cm of submissionComments.data ?? []) {
      pushOtherPartyComment(items, profile, {
        id: `sub-comment-${cm.id}`,
        at: cm.created_at as string,
        content: cm.content as string,
        where: "submission",
        href: cm.submission_id
          ? `/dashboard/submissions/${cm.submission_id}`
          : "/dashboard/submissions",
        kind: "submission_comment",
        author: cm.author as { id?: string; role?: string } | null,
      });
    }

    for (const dp of datePosts.data ?? []) {
      const date = dp.date as { title?: string } | null;
      const body = (dp.body as string | null)?.trim();
      pushOtherPartyComment(items, profile, {
        id: `date-comment-${dp.id}`,
        at: dp.created_at as string,
        content: body || "Shared on the date timeline",
        where: "date",
        href: "/dashboard/dates",
        kind: "date_comment",
        context: date?.title ?? null,
        author: dp.author as { id?: string; role?: string } | null,
      });
    }

    for (const w of wishlistGiftItems.data ?? []) {
      pushItem(items, {
        id: `wish-gift-${w.id}`,
        at: w.created_at as string,
        title: "Gift idea · D",
        // Titles stay secret until Arrived/Reveal (RLS also hides unrevealed rows).
        body: "D suggested a gift for you",
        href: "/dashboard/wishlist",
        kind: "wishlist_gift_add",
      });
    }

    for (const w of wishlistItems.data ?? []) {
      const at =
        (w.updated_at as string) ||
        (w.fulfilled_at as string) ||
        (w.seen_at as string) ||
        (w.created_at as string);
      const title = (w.title as string) || "Wishlist item";
      if (w.seen_at) {
        pushItem(items, {
          id: `wish-seen-${w.id}`,
          at: w.seen_at as string,
          title: "Wishlist item seen · D",
          body: title,
          href: "/dashboard/wishlist",
          kind: "wishlist_seen",
        });
      }
      const notes = (w.fulfillment_notes as string | null)?.trim();
      if (notes) {
        pushItem(items, {
          id: `wish-notes-${w.id}`,
          at,
          title: "Note on wishlist · D",
          body: `${title.slice(0, 40)} — ${notes.slice(0, 80)}`,
          href: "/dashboard/wishlist",
          kind: "wishlist_note",
        });
      }
      const status = w.status as string;
      if (status === "ordered" || status === "fulfilled") {
        pushItem(items, {
          id: `wish-status-${w.id}-${status}`,
          at,
          title: `Wishlist ${status} · D`,
          body: title,
          href: "/dashboard/wishlist",
          kind: "wishlist_status",
        });
      }
    }

    for (const m of wishlistMessages.data ?? []) {
      const item = m.item as { title?: string } | null;
      pushOtherPartyComment(items, profile, {
        id: `wish-comment-${m.id}`,
        at: m.created_at as string,
        content: m.content as string,
        where: "wishlist",
        href: "/dashboard/wishlist",
        kind: "wishlist_comment",
        context: item?.title ?? null,
        author: m.author as { id?: string; role?: string } | null,
      });
    }

    for (const g of worshipGalleries.data ?? []) {
      pushItem(items, {
        id: `worship-gallery-${g.id}`,
        at: g.created_at as string,
        title: "Worship gallery · D",
        body: (g.topic as string) || "A new themed collection",
        href: `/dashboard/worship/${g.id as string}`,
        kind: "worship_gallery_add",
      });
    }

    for (const w of worshipEntries.data ?? []) {
      const galleryId = w.gallery_id as string | undefined;
      pushItem(items, {
        id: `worship-add-${w.id}`,
        at: w.created_at as string,
        title: "Worship photo · D",
        body: (w.title as string) || "A new photo of you",
        href: galleryId ? `/dashboard/worship/${galleryId}` : "/dashboard/worship",
        kind: "worship_add",
      });
    }

    for (const m of worshipMessages.data ?? []) {
      const entry = m.entry as { title?: string; gallery_id?: string } | null;
      pushOtherPartyComment(items, profile, {
        id: `worship-comment-${m.id}`,
        at: m.created_at as string,
        content: m.content as string,
        where: "worship",
        href: entry?.gallery_id
          ? `/dashboard/worship/${entry.gallery_id}`
          : "/dashboard/worship",
        kind: "worship_comment",
        context: entry?.title ?? null,
        author: m.author as { id?: string; role?: string } | null,
      });
    }

    for (const dm of directMessages.data ?? []) {
      const sender = dm.sender as { role?: string; id?: string } | null;
      if (!isFromOtherParty(sender, profile)) continue;
      const attachmentType = dm.attachment_type as string | null;
      if (
        attachmentType &&
        COMMENT_ATTACHMENT_TYPES.has(attachmentType)
      ) {
        continue;
      }
      const href =
        attachmentType === "punishment"
          ? "/dashboard/punishments"
          : attachmentType === "date"
            ? "/dashboard/dates"
            : attachmentType === "wishlist"
              ? "/dashboard/wishlist"
              : attachmentType === "worship"
                ? dm.attachment_id
                  ? `/dashboard/worship/${dm.attachment_id as string}`
                  : "/dashboard/worship"
              : "/dashboard/inbox";
      if (dm.voice_path) {
        pushItem(items, {
          id: `inbox-voice-${dm.id}`,
          at: dm.created_at as string,
          title: "Voice from D",
          body: "Inbox voice note",
          href,
          kind: "inbox_voice",
        });
      } else if (dm.content) {
        pushItem(items, {
          id: `inbox-msg-${dm.id}`,
          at: dm.created_at as string,
          title: "Message from D",
          body: (dm.content as string).slice(0, 80),
          href,
          kind: "inbox_message",
        });
      }
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

    for (const cap of teaseViewCaptures.data ?? []) {
      const viewer = cap.viewer as { role?: string; id?: string } | null;
      if (!isFromOtherParty(viewer, profile)) continue;
      const tease = cap.tease as { title?: string } | null;
      pushItem(items, {
        id: `tease-react-vid-${cap.id}`,
        at: cap.created_at as string,
        title: "Reaction video on tease · D",
        body: tease?.title ?? "D viewed a tease on camera",
        href: "/dashboard/teases",
        kind: "tease_reaction_video",
      });
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
      const tease = m.tease as { title?: string } | null;
      pushOtherPartyComment(items, profile, {
        id: `tease-comment-${m.id}`,
        at: m.created_at as string,
        content: m.content as string,
        where: "tease",
        href: "/dashboard/teases",
        kind: "tease_comment",
        context: tease?.title ?? null,
        author: m.author as { id?: string; role?: string } | null,
      });
    }

    for (const m of rewardMessages.data ?? []) {
      const reward = m.reward as { title?: string } | null;
      pushOtherPartyComment(items, profile, {
        id: `reward-comment-${m.id}`,
        at: m.created_at as string,
        content: m.content as string,
        where: "reward",
        href: "/dashboard/rewards",
        kind: "reward_comment",
        context: reward?.title ?? null,
        author: m.author as { id?: string; role?: string } | null,
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
      const author = v.author as { role?: string; username?: string; id?: string } | null;
      if (!isFromOtherParty(author, profile)) continue;
      const href = voiceNoteHref(
        v.entity_type as string,
        v.entity_id as string | undefined
      );
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
                : v.entity_type === "journal"
                  ? "Voice on journal"
                  : v.entity_type === "request"
                    ? "Voice on a request"
                    : v.entity_type === "wishlist"
                      ? "Voice on wishlist"
                    : v.entity_type === "worship"
                      ? "Voice on worship"
                      : v.entity_type === "worship_gallery"
                        ? "Voice on worship gallery"
                      : "New voice message",
        href,
        kind: "voice_note",
      });
    }
  } else {
    const { data: queenRow } = await supabase
      .from("users")
      .select("id")
      .eq("role", "queen")
      .limit(1)
      .maybeSingle();
    const queenId = (queenRow?.id as string | undefined) ?? undefined;

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
      journalComments,
      submissionComments,
      directMessages,
      datePosts,
      wishlistItems,
      wishlistMessages,
      worshipGalleries,
      worshipEntries,
      worshipMessages,
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
        .select(
          "id, title, status, direction, queen_response, responded_at, created_at, updated_at, assigned_to"
        )
        .or(`requested_by.eq.${profile.id},assigned_to.eq.${profile.id}`)
        .order("updated_at", { ascending: false })
        .limit(12),
      supabase
        .from("request_messages")
        .select(
          "id, content, created_at, request_id, author_id, author:users!author_id(id, role, username), request:requests(title)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
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
          "id, content, created_at, tease_id, author_id, author:users!author_id(id, role, username), tease:teases(title)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("reward_messages")
        .select(
          "id, content, created_at, reward_id, author_id, author:users!author_id(id, role, username), reward:rewards(title)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
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
        .limit(FETCH_LIMIT),
      supabase
        .from("journal_comments")
        .select(
          "id, content, created_at, entry_id, author_id, author:users!author_id(id, role, username)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("comments")
        .select(
          "id, content, created_at, submission_id, commented_by, author:users!commented_by(id, role, username)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("direct_messages")
        .select(
          "id, content, created_at, sender_id, voice_path, media_type, attachment_type, attachment_id, sender:users!sender_id(id, role, username)"
        )
        .neq("sender_id", profile.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("date_posts")
        .select(
          "id, body, created_at, date_id, author_id, author:users!author_id(id, role, username), date:queen_dates(title)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      queenId
        ? supabase
            .from("wishlist_items")
            .select(
              "id, title, created_at, created_by, creator:users!created_by(id, role)"
            )
            .eq("created_by", queenId)
            .eq("item_kind", "queen_taste")
            .order("created_at", { ascending: false })
            .limit(FETCH_LIMIT)
        : Promise.resolve({ data: [] }),
      supabase
        .from("wishlist_messages")
        .select(
          "id, content, created_at, wishlist_id, author_id, author:users!author_id(id, role, username), item:wishlist_items(title)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("worship_galleries")
        .select("id, topic, viewed_at, created_at, created_by")
        .eq("created_by", profile.id)
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("worship_entries")
        .select("id, title, viewed_at, gallery_id, created_at, created_by")
        .eq("created_by", profile.id)
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
      supabase
        .from("worship_messages")
        .select(
          "id, content, created_at, worship_id, author_id, author:users!author_id(id, role, username), entry:worship_entries(title, gallery_id)"
        )
        .order("created_at", { ascending: false })
        .limit(FETCH_LIMIT),
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
      const isDirective =
        (r.direction as string | undefined) === "directive" &&
        r.assigned_to === profile.id;

      if (isDirective && r.status === "pending") {
        pushItem(items, {
          id: `directive-${r.id}`,
          at: (r.updated_at as string) || (r.created_at as string),
          title: "Directive from Queen",
          body: r.title as string,
          href: "/dashboard/requests",
          kind: "directive",
        });
        continue;
      }

      if (r.responded_at && r.status !== "pending" && r.status !== "withdrawn") {
        pushItem(items, {
          id: `req-reply-${r.id}`,
          at: r.responded_at as string,
          title:
            r.status === "approved"
              ? "Request granted"
              : r.status === "denied"
                ? "Request denied"
                : `Request ${r.status}`,
          body:
            (r.queen_response as string | null)?.slice(0, 80) ||
            (r.title as string),
          href: "/dashboard/requests",
          kind: "request_reply",
        });
      }
    }

    for (const m of messages.data ?? []) {
      const request = m.request as { title?: string } | null;
      pushOtherPartyComment(items, profile, {
        id: `req-comment-${m.id}`,
        at: m.created_at as string,
        content: m.content as string,
        where: "request",
        href: "/dashboard/requests",
        kind: "request_comment",
        context: request?.title ?? null,
        author: m.author as { id?: string; role?: string } | null,
      });
    }

    for (const jc of journalComments.data ?? []) {
      pushOtherPartyComment(items, profile, {
        id: `journal-comment-${jc.id}`,
        at: jc.created_at as string,
        content: jc.content as string,
        where: "journal",
        href: "/dashboard/journal",
        kind: "journal_comment",
        author: jc.author as { id?: string; role?: string } | null,
      });
    }

    for (const cm of submissionComments.data ?? []) {
      pushOtherPartyComment(items, profile, {
        id: `sub-comment-${cm.id}`,
        at: cm.created_at as string,
        content: cm.content as string,
        where: "submission",
        href: cm.submission_id
          ? `/dashboard/submissions/${cm.submission_id}`
          : "/dashboard/submissions",
        kind: "submission_comment",
        author: cm.author as { id?: string; role?: string } | null,
      });
    }

    for (const dp of datePosts.data ?? []) {
      const date = dp.date as { title?: string } | null;
      const body = (dp.body as string | null)?.trim();
      pushOtherPartyComment(items, profile, {
        id: `date-comment-${dp.id}`,
        at: dp.created_at as string,
        content: body || "Shared on the date timeline",
        where: "date",
        href: "/dashboard/dates",
        kind: "date_comment",
        context: date?.title ?? null,
        author: dp.author as { id?: string; role?: string } | null,
      });
    }

    for (const w of wishlistItems.data ?? []) {
      const creator = w.creator as { id?: string; role?: string } | null;
      pushOtherPartyAdd(items, profile, {
        id: `wish-add-${w.id}`,
        at: w.created_at as string,
        where: "wishlist",
        body: (w.title as string) || "Something she wants",
        href: "/dashboard/wishlist",
        kind: "wishlist_add",
        author: creator ?? { id: w.created_by as string, role: "queen" },
      });
    }

    for (const m of wishlistMessages.data ?? []) {
      const item = m.item as { title?: string } | null;
      pushOtherPartyComment(items, profile, {
        id: `wish-comment-${m.id}`,
        at: m.created_at as string,
        content: m.content as string,
        where: "wishlist",
        href: "/dashboard/wishlist",
        kind: "wishlist_comment",
        context: item?.title ?? null,
        author: m.author as { id?: string; role?: string } | null,
      });
    }

    for (const w of worshipGalleries.data ?? []) {
      if (w.viewed_at) {
        pushItem(items, {
          id: `worship-gallery-viewed-${w.id}`,
          at: w.viewed_at as string,
          title: "Queen viewed your gallery",
          body: (w.topic as string) || "Your worship gallery",
          href: `/dashboard/worship/${w.id as string}`,
          kind: "worship_gallery_viewed",
        });
      }
    }

    for (const w of worshipEntries.data ?? []) {
      if (w.viewed_at) {
        const galleryId = w.gallery_id as string | undefined;
        pushItem(items, {
          id: `worship-viewed-${w.id}`,
          at: w.viewed_at as string,
          title: "Queen viewed your photo",
          body: (w.title as string) || "Your offering",
          href: galleryId ? `/dashboard/worship/${galleryId}` : "/dashboard/worship",
          kind: "worship_viewed",
        });
      }
    }

    for (const m of worshipMessages.data ?? []) {
      const entry = m.entry as { title?: string; gallery_id?: string } | null;
      pushOtherPartyComment(items, profile, {
        id: `worship-comment-${m.id}`,
        at: m.created_at as string,
        content: m.content as string,
        where: "worship",
        href: entry?.gallery_id
          ? `/dashboard/worship/${entry.gallery_id}`
          : "/dashboard/worship",
        kind: "worship_comment",
        context: entry?.title ?? null,
        author: m.author as { id?: string; role?: string } | null,
      });
    }

    for (const dm of directMessages.data ?? []) {
      const sender = dm.sender as { role?: string; id?: string } | null;
      if (!isFromOtherParty(sender, profile)) continue;
      const attachmentType = dm.attachment_type as string | null;
      if (
        attachmentType &&
        COMMENT_ATTACHMENT_TYPES.has(attachmentType)
      ) {
        continue;
      }
      const href =
        attachmentType === "punishment"
          ? "/dashboard/punishments"
          : attachmentType === "date"
            ? "/dashboard/dates"
            : attachmentType === "wishlist"
              ? "/dashboard/wishlist"
              : attachmentType === "worship"
                ? dm.attachment_id
                  ? `/dashboard/worship/${dm.attachment_id as string}`
                  : "/dashboard/worship"
              : "/dashboard/inbox";
      if (dm.voice_path) {
        pushItem(items, {
          id: `inbox-voice-${dm.id}`,
          at: dm.created_at as string,
          title: "Voice from Queen",
          body: "Inbox voice note",
          href,
          kind: "inbox_voice",
        });
      } else if (dm.content) {
        pushItem(items, {
          id: `inbox-msg-${dm.id}`,
          at: dm.created_at as string,
          title: "Message from Queen",
          body: (dm.content as string).slice(0, 80),
          href,
          kind: "inbox_message",
        });
      }
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
      const tease = m.tease as { title?: string } | null;
      pushOtherPartyComment(items, profile, {
        id: `tease-comment-${m.id}`,
        at: m.created_at as string,
        content: m.content as string,
        where: "tease",
        href: "/dashboard/teases",
        kind: "tease_comment",
        context: tease?.title ?? null,
        author: m.author as { id?: string; role?: string } | null,
      });
    }

    for (const m of rewardMessages.data ?? []) {
      const reward = m.reward as { title?: string } | null;
      pushOtherPartyComment(items, profile, {
        id: `reward-comment-${m.id}`,
        at: m.created_at as string,
        content: m.content as string,
        where: "reward",
        href: "/dashboard/rewards",
        kind: "reward_comment",
        context: reward?.title ?? null,
        author: m.author as { id?: string; role?: string } | null,
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
      const author = v.author as { role?: string; username?: string; id?: string } | null;
      if (!isFromOtherParty(author, profile)) continue;
      const href = voiceNoteHref(
        v.entity_type as string,
        v.entity_id as string | undefined
      );
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
                : v.entity_type === "journal"
                  ? "Voice on journal"
                  : v.entity_type === "request"
                    ? "Voice on a request"
                    : v.entity_type === "wishlist"
                      ? "Voice on wishlist"
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
  window.dispatchEvent(new CustomEvent("activity-seen", { detail: iso }));
}

/** Mark activity at or before this timestamp as read (e.g. when opening one item). */
export function markActivitySeenUpTo(iso: string) {
  const current = getActivitySeenAt();
  if (
    !current ||
    new Date(iso).getTime() > new Date(current).getTime()
  ) {
    markActivitySeen(iso);
  }
}

/** Fetch enough items to compute an accurate unseen badge count. */
export const ACTIVITY_COUNT_LIMIT = 40;

export function countUnseen(items: ActivityItem[], seenAt: string | null) {
  if (!seenAt) return items.length;
  const t = new Date(seenAt).getTime();
  return items.filter((i) => new Date(i.at).getTime() > t).length;
}

export function isActivityUnseen(
  item: ActivityItem,
  seenAt: string | null
): boolean {
  if (!seenAt) return true;
  return new Date(item.at).getTime() > new Date(seenAt).getTime();
}

export function filterUnseenActivity(
  items: ActivityItem[],
  seenAt: string | null
): ActivityItem[] {
  return items.filter((item) => isActivityUnseen(item, seenAt));
}

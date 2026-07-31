import type { createClient } from "@/lib/supabase/client";
import { messageAttachmentHref, inboxAnchors } from "@/lib/inbox-deep-links";
import type { Profile, UserRole } from "@/lib/types";

type Supabase = ReturnType<typeof createClient>;

export type InboxTopic =
  | "general"
  | "teases"
  | "punishments"
  | "dates"
  | "tasks"
  | "rewards"
  | "requests"
  | "journal"
  | "worship";

export type MessageAttachmentType =
  | "tease"
  | "task"
  | "punishment"
  | "reward"
  | "request"
  | "date"
  | "journal"
  | "submission"
  | "wishlist"
  | "worship"
  | "worship_assignment"
  | "denial";

export type MessageMediaType = "image" | "video";

export const INBOX_TOPICS: {
  topic: InboxTopic;
  label: string;
  description: string;
}[] = [
  {
    topic: "general",
    label: "Queen Sisi",
    description: "Messages, comments, and important posts",
  },
  {
    topic: "teases",
    label: "Teases",
    description: "Teases, reveals, and beg replies",
  },
  {
    topic: "punishments",
    label: "Punishments",
    description: "Consequences and clearance",
  },
  {
    topic: "dates",
    label: "Dates",
    description: "Timeline posts and date talk",
  },
  {
    topic: "tasks",
    label: "Tasks",
    description: "Duties, submissions, and review",
  },
  {
    topic: "rewards",
    label: "Rewards",
    description: "Gifts and thank-yous",
  },
  {
    topic: "requests",
    label: "Requests",
    description: "Petitions and directives",
  },
  {
    topic: "journal",
    label: "Journal",
    description: "Shared entries and comments",
  },
  {
    topic: "worship",
    label: "Worship",
    description: "Galleries, photos, and devotion",
  },
];

export type DirectMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_path: string | null;
  media_type: MessageMediaType | null;
  voice_path: string | null;
  voice_duration_ms: number | null;
  attachment_type: MessageAttachmentType | null;
  attachment_id: string | null;
  attachment_anchor: string | null;
  reply_to_id: string | null;
  deleted_at: string | null;
  created_at: string;
};

export type DirectMessageReplyPreview = {
  id: string;
  sender_id: string;
  content: string | null;
  media_path: string | null;
  media_type: MessageMediaType | null;
  voice_path: string | null;
  attachment_type: MessageAttachmentType | null;
  sender?: Pick<Profile, "id" | "username" | "role" | "avatar_url"> | null;
};

export type DirectMessageWithSender = DirectMessage & {
  sender?: Pick<Profile, "id" | "username" | "role" | "avatar_url"> | null;
  reply_to?: DirectMessageReplyPreview | null;
};

export type AppNotification = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  read_at: string | null;
};

export type TopicThreadSummary = {
  conversationId: string;
  topic: InboxTopic;
  label: string;
  description: string;
  unread: number;
  lastMessage: DirectMessageWithSender | null;
  other?: Pick<Profile, "id" | "username" | "role" | "avatar_url"> | null;
};

export async function ensureConversation(supabase: Supabase): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_topic_conversations");
  if (error) {
    // Fallback for older deploy before RPC rename
    const legacy = await supabase.rpc("ensure_queen_slave_conversation");
    if (legacy.error) throw error;
    return legacy.data as string;
  }
  if (!data) throw new Error("Could not open conversation");
  return data as string;
}

export async function getTopicConversationId(
  supabase: Supabase,
  topic: InboxTopic
): Promise<string> {
  const { data, error } = await supabase.rpc("get_topic_conversation", {
    p_topic: topic,
  });
  if (error) throw error;
  if (!data) throw new Error(`No conversation for ${topic}`);
  return data as string;
}

type InboxThreadRow = {
  conversation_id: string;
  topic: InboxTopic;
  unread: number | string;
  last_message: DirectMessageWithSender | null;
  other_user: Pick<Profile, "id" | "username" | "role" | "avatar_url"> | null;
};

export async function listTopicThreads(
  supabase: Supabase,
  _myId: string
): Promise<TopicThreadSummary[]> {
  const { data, error } = await supabase.rpc("list_inbox_threads");
  if (error) throw error;

  const byTopic = new Map<InboxTopic, InboxThreadRow>();
  for (const row of (data as InboxThreadRow[] | null) ?? []) {
    byTopic.set(row.topic, row);
  }

  // Single unified thread — topic conversations are hidden from the inbox.
  const meta = INBOX_TOPICS.find((t) => t.topic === "general")!;
  const row = byTopic.get("general");
  if (!row) return [];
  return [
    {
      conversationId: row.conversation_id,
      topic: "general",
      label: meta.label,
      description: meta.description,
      unread: Number(row.unread ?? 0),
      lastMessage: row.last_message ?? null,
      other: row.other_user ?? null,
    },
  ];
}

/**
 * Mirror entity activity into the unified Queen Sisi inbox thread.
 * `topic` is accepted for call-site compatibility but always writes to `general`.
 */
export async function postToTopicThread(
  supabase: Supabase,
  opts: {
    topic: InboxTopic;
    senderId: string;
    content?: string | null;
    mediaPath?: string | null;
    mediaType?: MessageMediaType | null;
    voicePath?: string | null;
    voiceDurationMs?: number | null;
    attachmentType?: MessageAttachmentType | null;
    attachmentId?: string | null;
    attachmentAnchor?: string | null;
  }
): Promise<DirectMessage | null> {
  try {
    const conversationId = await getTopicConversationId(supabase, "general");
    return await sendDirectMessage(supabase, {
      conversationId,
      senderId: opts.senderId,
      content: opts.content,
      mediaPath: opts.mediaPath,
      mediaType: opts.mediaType,
      voicePath: opts.voicePath,
      voiceDurationMs: opts.voiceDurationMs,
      attachmentType: opts.attachmentType,
      attachmentId: opts.attachmentId,
      attachmentAnchor: opts.attachmentAnchor,
    });
  } catch (err) {
    console.error("postToTopicThread failed", err);
    return null;
  }
}

export function inboxConversationHref(conversationId: string): string {
  return `/dashboard/inbox/${conversationId}`;
}

/** Mirror slave/Queen worship activity into the Worship inbox thread + notify. */
export async function notifyWorshipThread(
  supabase: Supabase,
  opts: {
    senderId: string;
    content: string;
    galleryId: string;
    attachmentAnchor?: string | null;
    pushTitle: string;
    pushBody: string;
    notifyTarget: "queen" | "slave";
  }
): Promise<void> {
  const dm = await postToTopicThread(supabase, {
    topic: "general",
    senderId: opts.senderId,
    content: opts.content,
    attachmentType: "worship",
    attachmentId: opts.galleryId,
    attachmentAnchor: opts.attachmentAnchor ?? null,
  });

  const deepLink = messageAttachmentHref({
    type: "worship",
    id: opts.galleryId,
    anchor: opts.attachmentAnchor,
  });

  const { notifyPush } = await import("@/lib/push-client");
  void notifyPush({
    title: opts.pushTitle,
    body: opts.pushBody,
    url: dm ? deepLink : deepLink,
    target: opts.notifyTarget,
    kind: "worship",
  });
}

/** Tease cards land in the Teases topic thread (not Direct — avoids double unread). */
export async function postTeaseToInboxes(
  supabase: Supabase,
  opts: {
    senderId: string;
    teaseId: string;
    content: string;
    attachmentAnchor?: string | null;
  }
): Promise<void> {
  await postToTopicThread(supabase, {
    topic: "general",
    senderId: opts.senderId,
    content: opts.content,
    attachmentType: "tease",
    attachmentId: opts.teaseId,
    attachmentAnchor: opts.attachmentAnchor ?? inboxAnchors.tease(opts.teaseId),
  });
}

export async function getOtherMember(
  supabase: Supabase,
  conversationId: string,
  myId: string
): Promise<Pick<Profile, "id" | "username" | "role" | "avatar_url"> | null> {
  const { data, error } = await supabase
    .from("conversation_members")
    .select("user_id, user:users!user_id(id, username, role, avatar_url)")
    .eq("conversation_id", conversationId)
    .neq("user_id", myId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("getOtherMember failed", error);
    return null;
  }

  const row = data as
    | {
        user?: Pick<Profile, "id" | "username" | "role" | "avatar_url"> | null;
      }
    | null;
  return row?.user ?? null;
}

/** Other party for a topic thread — member row first, then other-role profile. */
export async function resolveInboxPartner(
  supabase: Supabase,
  opts: {
    conversationId: string;
    myId: string;
    myRole: UserRole;
  }
): Promise<Pick<Profile, "id" | "username" | "role" | "avatar_url"> | null> {
  const fromMembers = await getOtherMember(
    supabase,
    opts.conversationId,
    opts.myId
  );
  if (fromMembers) return fromMembers;

  const otherRole: UserRole = opts.myRole === "queen" ? "slave" : "queen";
  const { data } = await supabase
    .from("users")
    .select("id, username, role, avatar_url")
    .eq("role", otherRole)
    .limit(1)
    .maybeSingle();

  return (data as Pick<Profile, "id" | "username" | "role" | "avatar_url"> | null) ?? null;
}

export async function getConversationTopic(
  supabase: Supabase,
  conversationId: string
): Promise<InboxTopic | null> {
  const { data } = await supabase
    .from("conversations")
    .select("topic")
    .eq("id", conversationId)
    .maybeSingle();
  if (!data) return null;
  return (data.topic as InboxTopic) ?? "general";
}

export async function isConversationMember(
  supabase: Supabase,
  conversationId: string,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export function messageSnippet(m: {
  content?: string | null;
  media_path?: string | null;
  media_type?: MessageMediaType | string | null;
  voice_path?: string | null;
  attachment_type?: MessageAttachmentType | string | null;
}): string {
  if (m.content?.trim()) return m.content.trim();
  if (m.voice_path) return "Voice message";
  if (m.media_type === "video") return "Video";
  if (m.media_path) return "Photo";
  if (m.attachment_type) {
    return attachmentLabel(m.attachment_type as MessageAttachmentType);
  }
  return "Message";
}

export async function fetchMessages(
  supabase: Supabase,
  conversationId: string,
  limit = 40
): Promise<DirectMessageWithSender[]> {
  // Newest-first query, then reverse for chat display (oldest → newest).
  const { data, error } = await supabase
    .from("direct_messages")
    .select("*, sender:users!sender_id(id, username, role, avatar_url)")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = ((data as DirectMessageWithSender[]) ?? []).slice().reverse();
  const byId = new Map(rows.map((m) => [m.id, m]));
  return rows.map((m) => ({
    ...m,
    reply_to: m.reply_to_id
      ? replyPreviewFromMessage(byId.get(m.reply_to_id))
      : null,
  }));
}

function replyPreviewFromMessage(
  m: DirectMessageWithSender | undefined
): DirectMessageReplyPreview | null {
  if (!m) return null;
  return {
    id: m.id,
    sender_id: m.sender_id,
    content: m.content,
    media_path: m.media_path,
    media_type: m.media_type,
    voice_path: m.voice_path,
    attachment_type: m.attachment_type,
    sender: m.sender ?? null,
  };
}

export async function markConversationRead(
  supabase: Supabase,
  conversationId: string,
  userId: string
) {
  await supabase
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

/** Mark every topic/direct thread as read for this user. */
export async function markAllConversationsRead(
  supabase: Supabase,
  userId: string
) {
  await supabase
    .from("conversation_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("user_id", userId);
}

/** Topic-thread nav badges retired — everything lives in the Queen Sisi thread. */
export const NAV_TOPIC_BY_HREF: Partial<Record<string, InboxTopic>> = {};

export async function countUnreadMessages(
  supabase: Supabase,
  conversationId: string,
  userId: string
): Promise<number> {
  const { data: member } = await supabase
    .from("conversation_members")
    .select("last_read_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  const since = member?.last_read_at ?? new Date(0).toISOString();

  const { count } = await supabase
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .neq("sender_id", userId)
    .is("deleted_at", null)
    .gt("created_at", since);

  return count ?? 0;
}

export async function countAllUnreadMessages(
  supabase: Supabase,
  _userId: string
): Promise<number> {
  const { data, error } = await supabase.rpc("count_inbox_unread");
  if (error) throw error;
  return Number(data ?? 0);
}

export async function sendDirectMessage(
  supabase: Supabase,
  opts: {
    conversationId: string;
    senderId: string;
    content?: string | null;
    mediaPath?: string | null;
    mediaType?: MessageMediaType | null;
    voicePath?: string | null;
    voiceDurationMs?: number | null;
    attachmentType?: MessageAttachmentType | null;
    attachmentId?: string | null;
    attachmentAnchor?: string | null;
    replyToId?: string | null;
  }
): Promise<DirectMessage> {
  const { data, error } = await supabase.rpc("send_inbox_message", {
    p_conversation_id: opts.conversationId,
    p_content: opts.content ?? null,
    p_media_path: opts.mediaPath ?? null,
    p_media_type: opts.mediaType ?? null,
    p_voice_path: opts.voicePath ?? null,
    p_voice_duration_ms: opts.voiceDurationMs ?? null,
    p_attachment_type: opts.attachmentType ?? null,
    p_attachment_id: opts.attachmentId ?? null,
    p_attachment_anchor: opts.attachmentAnchor ?? null,
    p_reply_to_id: opts.replyToId ?? null,
  });

  if (error) {
    throw new Error(error.message || "Could not send message");
  }
  if (!data) {
    throw new Error("Could not send message");
  }
  return data as DirectMessage;
}

export async function softDeleteMessage(
  supabase: Supabase,
  messageId: string
) {
  const { error } = await supabase
    .from("direct_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId);
  if (error) throw error;
}

export function attachmentHref(
  type: MessageAttachmentType,
  id: string,
  anchor?: string | null
): string {
  return messageAttachmentHref({ type, id, anchor });
}

export function attachmentLabel(type: MessageAttachmentType): string {
  const labels: Record<MessageAttachmentType, string> = {
    task: "Task",
    tease: "Tease",
    punishment: "Punishment",
    reward: "Reward",
    request: "Request",
    date: "Date",
    journal: "Journal",
    submission: "Submission",
    wishlist: "Wishlist",
    worship: "Worship",
    worship_assignment: "Worship assignment",
    denial: "Denial",
  };
  return labels[type];
}

export function topicLabel(topic: InboxTopic): string {
  return INBOX_TOPICS.find((t) => t.topic === topic)?.label ?? topic;
}

export async function resolveOtherUserId(
  supabase: Supabase,
  myRole: UserRole
): Promise<string | null> {
  const otherRole = myRole === "queen" ? "slave" : "queen";
  const { data } = await supabase
    .from("users")
    .select("id")
    .eq("role", otherRole)
    .maybeSingle();
  return data?.id ?? null;
}

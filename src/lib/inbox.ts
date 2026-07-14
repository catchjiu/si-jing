import type { createClient } from "@/lib/supabase/client";
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
  | "journal";

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
  | "worship";

export type MessageMediaType = "image" | "video";

export const INBOX_TOPICS: {
  topic: InboxTopic;
  label: string;
  description: string;
}[] = [
  {
    topic: "general",
    label: "Direct",
    description: "Private messages",
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

  // Keep general first, then the rest in INBOX_TOPICS order
  return INBOX_TOPICS.flatMap((meta) => {
    const row = byTopic.get(meta.topic);
    if (!row) return [];
    return [
      {
        conversationId: row.conversation_id,
        topic: meta.topic,
        label: meta.label,
        description: meta.description,
        unread: Number(row.unread ?? 0),
        lastMessage: row.last_message ?? null,
        other: row.other_user ?? null,
      },
    ];
  });
}

/** Post into a topic thread (mirrors entity activity into inbox). */
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
  }
): Promise<DirectMessage | null> {
  try {
    const conversationId = await getTopicConversationId(supabase, opts.topic);
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
    });
  } catch (err) {
    console.error("postToTopicThread failed", err);
    return null;
  }
}

/** Tease cards land in both Teases topic and Direct inbox. */
export async function postTeaseToInboxes(
  supabase: Supabase,
  opts: {
    senderId: string;
    teaseId: string;
    content: string;
  }
): Promise<void> {
  await Promise.all([
    postToTopicThread(supabase, {
      topic: "teases",
      senderId: opts.senderId,
      content: opts.content,
      attachmentType: "tease",
      attachmentId: opts.teaseId,
    }),
    postToTopicThread(supabase, {
      topic: "general",
      senderId: opts.senderId,
      content: opts.content,
      attachmentType: "tease",
      attachmentId: opts.teaseId,
    }),
  ]);
}

export async function getOtherMember(
  supabase: Supabase,
  conversationId: string,
  myId: string
): Promise<Pick<Profile, "id" | "username" | "role" | "avatar_url"> | null> {
  const { data } = await supabase
    .from("conversation_members")
    .select("user_id, user:users!user_id(id, username, role, avatar_url)")
    .eq("conversation_id", conversationId)
    .neq("user_id", myId)
    .maybeSingle();

  const row = data as
    | {
        user?: Pick<Profile, "id" | "username" | "role" | "avatar_url"> | null;
      }
    | null;
  return row?.user ?? null;
}

export async function getConversationTopic(
  supabase: Supabase,
  conversationId: string
): Promise<InboxTopic> {
  const { data } = await supabase
    .from("conversations")
    .select("topic")
    .eq("id", conversationId)
    .maybeSingle();
  return ((data?.topic as InboxTopic) ?? "general");
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
  limit = 100
): Promise<DirectMessageWithSender[]> {
  const { data, error } = await supabase
    .from("direct_messages")
    .select("*, sender:users!sender_id(id, username, role, avatar_url)")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) throw error;
  const rows = (data as DirectMessageWithSender[]) ?? [];
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
    replyToId?: string | null;
  }
): Promise<DirectMessage> {
  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      conversation_id: opts.conversationId,
      sender_id: opts.senderId,
      content: opts.content ?? null,
      media_path: opts.mediaPath ?? null,
      media_type: opts.mediaType ?? null,
      voice_path: opts.voicePath ?? null,
      voice_duration_ms: opts.voiceDurationMs ?? null,
      attachment_type: opts.attachmentType ?? null,
      attachment_id: opts.attachmentId ?? null,
      reply_to_id: opts.replyToId ?? null,
    })
    .select("*")
    .single();

  if (error) throw error;
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
  id: string
): string {
  if (type === "task" || type === "submission") return `/dashboard/task/${id}`;
  if (type === "tease") return `/dashboard/teases`;
  if (type === "punishment") return `/dashboard/punishments`;
  if (type === "reward") return `/dashboard/rewards`;
  if (type === "request") return `/dashboard/requests`;
  if (type === "date") return `/dashboard/dates`;
  if (type === "journal") return `/dashboard/journal`;
  if (type === "wishlist") return `/dashboard/wishlist`;
  if (type === "worship") return `/dashboard/worship`;
  return `/dashboard/inbox`;
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

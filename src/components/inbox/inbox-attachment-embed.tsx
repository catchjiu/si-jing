"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { signObjectUrl } from "@/lib/storage/client";
import {
  attachmentHref,
  attachmentLabel,
  type MessageAttachmentType,
} from "@/lib/inbox";
import { isWishlistSecretForQueen } from "@/lib/wishlist";
import { getStoryLockKind, splitStoryAtLastTbc } from "@/lib/story-access";
import { formatFartDate } from "@/lib/fart";
import { WatermarkedFrame } from "@/components/media/watermarked-frame";
import { MessageCard } from "@/components/inbox/message-card";
import { InboxTeaseEmbed } from "@/components/inbox/inbox-tease-embed";
import { cn } from "@/lib/utils";

type StorageBucket =
  | "teases"
  | "rewards"
  | "worship"
  | "submissions"
  | "date_posts"
  | "wishlist"
  | "messages"
  | "voice"
  | "journal"
  | "stories"
  | "creep";

type Preview = {
  title: string;
  body?: string | null;
  imagePath?: string | null;
  bucket?: StorageBucket;
  mediaKind?: "image" | "video";
};

function creepEntryIdFromAnchor(anchor?: string | null): string | null {
  if (!anchor) return null;
  if (anchor.startsWith("creep_entry:")) {
    return anchor.slice("creep_entry:".length) || null;
  }
  if (anchor.startsWith("creep_photo_comment:")) {
    const rest = anchor.slice("creep_photo_comment:".length);
    return rest.split(":")[0] || null;
  }
  return null;
}

function worshipEntryIdFromAnchor(anchor?: string | null): string | null {
  if (!anchor) return null;
  if (anchor.startsWith("worship_entry:")) {
    return anchor.slice("worship_entry:".length) || null;
  }
  if (anchor.startsWith("worship_photo_comment:")) {
    const rest = anchor.slice("worship_photo_comment:".length);
    return rest.split(":")[0] || null;
  }
  return null;
}

async function loadPreview(
  type: MessageAttachmentType,
  id: string,
  anchor: string | null | undefined,
  isQueen: boolean,
  viewerId?: string | null
): Promise<Preview | null> {
  const supabase = createClient();

  if (type === "worship") {
    const entryId = worshipEntryIdFromAnchor(anchor);
    if (entryId) {
      const { data } = await supabase
        .from("worship_entries")
        .select("id, title, description, image_path, media_kind, storage_bucket")
        .eq("id", entryId)
        .maybeSingle();
      if (data) {
        return {
          title: (data.title as string) || "Worship photo",
          body: (data.description as string | null) ?? null,
          imagePath: data.image_path as string,
          bucket: "worship",
          mediaKind:
            (data.media_kind as string) === "video" ? "video" : "image",
        };
      }
    }
    const { data: gallery } = await supabase
      .from("worship_galleries")
      .select("id, topic")
      .eq("id", id)
      .maybeSingle();
    const { data: latest } = await supabase
      .from("worship_entries")
      .select("id, title, description, image_path, media_kind, storage_bucket")
      .eq("gallery_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) {
      return {
        title:
          (latest.title as string) ||
          (gallery?.topic as string) ||
          "Worship",
        body: (latest.description as string | null) ?? null,
        imagePath: latest.image_path as string,
        bucket: "worship",
        mediaKind:
          (latest.media_kind as string) === "video" ? "video" : "image",
      };
    }
    if (gallery) {
      return { title: (gallery.topic as string) || "Worship" };
    }
    return null;
  }

  if (type === "reward") {
    const { data } = await supabase
      .from("rewards")
      .select("id, title, message, image_path")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      title: (data.title as string) || "Reward",
      body: (data.message as string | null) ?? null,
      imagePath: (data.image_path as string | null) ?? null,
      bucket: "rewards",
      mediaKind: "image",
    };
  }

  if (type === "wishlist") {
    const { data } = await supabase
      .from("wishlist_items")
      .select("id, title, notes, image_path, item_kind, arrived_at")
      .eq("id", id)
      .maybeSingle();
    if (!data) return { title: "Wishlist" };
    const secret = isWishlistSecretForQueen(
      {
        item_kind: data.item_kind as "queen_taste" | "slave_gift",
        arrived_at: data.arrived_at as string | null,
      },
      isQueen
    );
    if (secret) {
      return { title: "Secret gift idea", body: "Open wishlist to reveal" };
    }
    return {
      title: (data.title as string) || "Wishlist item",
      body: (data.notes as string | null) ?? null,
      imagePath: (data.image_path as string | null) ?? null,
      bucket: "wishlist",
      mediaKind: "image",
    };
  }

  if (type === "journal") {
    const { data } = await supabase
      .from("journal_entries")
      .select("id, body, entry_date, image_path")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const body = ((data.body as string | null) ?? "").trim();
    return {
      title: data.entry_date
        ? `Journal · ${data.entry_date}`
        : "Journal",
      body: body.slice(0, 160) || (data.image_path ? "Photo entry" : null),
      imagePath: (data.image_path as string | null) ?? null,
      bucket: "journal",
      mediaKind: "image",
    };
  }

  if (type === "story") {
    const { data } = await supabase
      .from("stories")
      .select(
        "id, title, body, status, author_id, viewable_until, tbc_locked, cover_image_path, access_grants:story_access_grants(grantee_id)"
      )
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const lockKind = viewerId
      ? getStoryLockKind({
          authorId: data.author_id as string,
          status: data.status as string,
          viewableUntil: data.viewable_until as string | null,
          tbcLocked: data.tbc_locked as boolean | null,
          html: data.body as string,
          viewerId,
          grants: (data.access_grants as { grantee_id: string }[] | null) ?? [],
        })
      : "none";
    if (lockKind === "full") {
      return {
        title: (data.title as string) || "Story",
        body: "Reading window closed — request access",
        imagePath: (data.cover_image_path as string | null) ?? null,
        bucket: "stories",
        mediaKind: "image",
      };
    }
    const sourceHtml =
      lockKind === "tbc"
        ? splitStoryAtLastTbc((data.body as string) ?? "").preview
        : ((data.body as string) ?? "");
    const plain = sourceHtml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      title: (data.title as string) || "Story",
      body:
        lockKind === "tbc"
          ? `${plain.slice(0, 120)}${plain ? " " : ""}To be continued — request access`
          : plain.slice(0, 160) || null,
      imagePath: (data.cover_image_path as string | null) ?? null,
      bucket: "stories",
      mediaKind: "image",
    };
  }

  if (type === "task") {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, description")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      title: (data.title as string) || "Task",
      body: (data.description as string | null)?.slice(0, 160) ?? null,
    };
  }

  if (type === "request") {
    const { data } = await supabase
      .from("requests")
      .select("id, title, message, image_path")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      title: (data.title as string) || "Request",
      body: (data.message as string | null)?.slice(0, 160) ?? null,
      imagePath: (data.image_path as string | null) ?? null,
      bucket: "submissions",
      mediaKind: "image",
    };
  }

  if (type === "date") {
    const { data } = await supabase
      .from("queen_dates")
      .select("id, title")
      .eq("id", id)
      .maybeSingle();
    const { data: post } = await supabase
      .from("date_posts")
      .select("id, body, file_path, media_kind")
      .eq("date_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      title: (data?.title as string) || "Date",
      body: (post?.body as string | null) ?? null,
      imagePath: (post?.file_path as string | null) ?? null,
      bucket: "date_posts",
      mediaKind:
        (post?.media_kind as string) === "video" ? "video" : "image",
    };
  }

  if (type === "fart") {
    const { data } = await supabase
      .from("fart_entries")
      .select("id, note, fart_date")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      title: data.fart_date
        ? `Fart · ${formatFartDate(data.fart_date as string)}`
        : "Fart",
      body: ((data.note as string | null) || "Open in Fart Tracker").slice(0, 160),
    };
  }

  if (type === "creep") {
    const entryId = creepEntryIdFromAnchor(anchor);
    if (entryId) {
      const { data } = await supabase
        .from("creep_entries")
        .select("id, title, description, image_path, media_kind")
        .eq("id", entryId)
        .maybeSingle();
      if (data) {
        return {
          title: (data.title as string) || "Creep",
          body: (data.description as string | null) ?? null,
          imagePath: data.image_path as string,
          bucket: "creep",
          mediaKind:
            (data.media_kind as string) === "video" ? "video" : "image",
        };
      }
    }
    const { data: gallery } = await supabase
      .from("creep_galleries")
      .select("id, title")
      .eq("id", id)
      .maybeSingle();
    const { data: latest } = await supabase
      .from("creep_entries")
      .select("id, title, description, image_path, media_kind")
      .eq("gallery_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest) {
      return {
        title:
          (latest.title as string) ||
          (gallery?.title as string) ||
          "Creep",
        body: (latest.description as string | null) ?? null,
        imagePath: latest.image_path as string,
        bucket: "creep",
        mediaKind:
          (latest.media_kind as string) === "video" ? "video" : "image",
      };
    }
    if (gallery) {
      return { title: (gallery.title as string) || "Creep" };
    }
    return null;
  }

  return null;
}

type Props = {
  type: MessageAttachmentType;
  id: string;
  anchor?: string | null;
  summary?: string | null;
  className?: string;
};

/** Rich clickable preview for mirrored inbox attachments. */
export function InboxAttachmentEmbed({
  type,
  id,
  anchor = null,
  summary,
  className,
}: Props) {
  const { isQueen, profile } = useAuth();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await loadPreview(type, id, anchor, isQueen, profile?.id);
      setPreview(next);
      if (next?.imagePath && next.bucket) {
        try {
          const url = await signObjectUrl({
            bucket: next.bucket,
            path: next.imagePath,
            expiresIn: 3600,
          });
          setSignedUrl(url);
        } catch {
          setSignedUrl(null);
        }
      } else {
        setSignedUrl(null);
      }
    } catch {
      setPreview(null);
      setSignedUrl(null);
    } finally {
      setLoading(false);
    }
  }, [type, id, anchor, isQueen, profile?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (type === "tease") {
    return (
      <InboxTeaseEmbed teaseId={id} anchor={anchor} className={className} />
    );
  }

  if (loading) {
    return (
      <div
        className={cn(
          "mt-2 flex h-28 items-center justify-center rounded-lg border border-gold/20 bg-void/50",
          className
        )}
      >
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!preview && !summary) {
    return (
      <MessageCard
        type={type}
        id={id}
        anchor={anchor}
        summary={summary}
        className={className}
      />
    );
  }

  const href = attachmentHref(type, id, anchor);
  const title = preview?.title || attachmentLabel(type);
  const body = preview?.body || summary;

  return (
    <Link
      href={href}
      className={cn(
        "mt-2 block overflow-hidden rounded-lg border border-gold/30 bg-void/50 transition-colors hover:border-gold/50 hover:bg-gold/5",
        className
      )}
    >
      {signedUrl && preview?.imagePath ? (
        <WatermarkedFrame
          className="relative aspect-[16/10] max-h-56 w-full bg-black"
          mediaPath={preview.imagePath}
        >
          {preview.mediaKind === "video" ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              src={signedUrl}
              className="h-full w-full object-contain"
              muted
              playsInline
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signedUrl}
              alt=""
              className="h-full w-full object-contain"
            />
          )}
        </WatermarkedFrame>
      ) : null}
      <div className="space-y-0.5 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wider text-gold">
          {attachmentLabel(type)}
        </p>
        <p className="text-sm text-ivory">{title}</p>
        {body ? (
          <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
            {body}
          </p>
        ) : null}
        <p className="pt-0.5 text-[11px] text-gold/80">Open →</p>
      </div>
    </Link>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  getConversationTopic,
  getTopicConversationId,
  isConversationMember,
  resolveInboxPartner,
} from "@/lib/inbox";
import type { Profile } from "@/lib/types";
import { ChatThread } from "@/components/inbox/chat-thread";
import { Badge } from "@/components/ui/badge";

export default function InboxChatPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = String(params.conversationId ?? "");
  const { profile } = useAuth();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null
  );
  const [other, setOther] = useState<Pick<
    Profile,
    "id" | "username" | "role" | "avatar_url"
  > | null>(null);
  const [ready, setReady] = useState(false);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!profile || !conversationId) return;
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        await supabase.rpc("ensure_topic_conversations");

        const t = await getConversationTopic(supabase, conversationId);
        if (!t) {
          if (!cancelled) setMissing(true);
          return;
        }

        // Collapse legacy topic threads into the unified Queen Sisi conversation.
        let resolvedId = conversationId;
        if (t !== "general") {
          resolvedId = await getTopicConversationId(supabase, "general");
          if (!cancelled && resolvedId !== conversationId) {
            router.replace(`/dashboard/inbox/${resolvedId}`);
          }
        }

        const member = await isConversationMember(
          supabase,
          resolvedId,
          profile.id
        );
        if (!member) {
          if (!cancelled) setMissing(true);
          return;
        }

        const partner = await resolveInboxPartner(supabase, {
          conversationId: resolvedId,
          myId: profile.id,
          myRole: profile.role,
        });
        if (!partner) {
          if (!cancelled) setMissing(true);
          return;
        }

        if (!cancelled) {
          setActiveConversationId(resolvedId);
          setOther(partner);
          setMissing(false);
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not open chat"
        );
        if (!cancelled) setMissing(true);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, conversationId, router]);

  if (!ready) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (missing || !other || !activeConversationId) {
    return (
      <div className="space-y-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          This conversation couldn&apos;t be opened. It may be outdated.
        </p>
        <Link
          href="/dashboard/inbox"
          className="inline-flex items-center gap-1 text-sm text-gold hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Inbox
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[28rem] flex-col space-y-3">
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href="/dashboard/inbox"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" />
          Inbox
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-b border-gold/10 pb-3">
        <h1 className="font-heading text-xl text-ivory sm:text-2xl">
          Queen Sisi
        </h1>
        <Badge
          variant="outline"
          className="border-gold/50 text-[10px] uppercase tracking-wider text-gold"
        >
          {other.username}
        </Badge>
      </div>
      <ChatThread
        conversationId={activeConversationId}
        recipientId={other.id}
        className="min-h-0 flex-1"
      />
    </div>
  );
}

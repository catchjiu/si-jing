"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { HeartCrack, Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { JealousyMission } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import { datePageHref, flirtPageHref, jealousyPageHref } from "@/lib/inbox-deep-links";
import { RoleSpeech } from "@/components/ui/role-speech";
import { JealousyMissionCommentThread } from "@/components/jealousy/jealousy-mission-comment-thread";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RivalFantasyPanel } from "@/components/jealousy/rival-fantasy-panel";

function sourceHref(m: JealousyMission): string {
  if (m.source_type === "flirt_guy") return flirtPageHref(m.source_id);
  return datePageHref(m.source_id);
}

export default function JealousyPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <JealousyPageInner />
    </Suspense>
  );
}

function JealousyPageInner() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get("mission");
  const focusCommentId = searchParams.get("comment");
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [items, setItems] = useState<JealousyMission[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [responding, setResponding] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("jealousy_missions")
      .select("*")
      .order("created_at", { ascending: false });
    if (isSlave) query = query.eq("assigned_to", profile.id);
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setItems((data as JealousyMission[]) ?? []);
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!focusId || loading) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(`jealousy-mission-${focusId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [focusId, loading]);

  const complete = async (mission: JealousyMission) => {
    if (!isSlave) return;
    const text = formatRoleSpeech((drafts[mission.id] ?? "").trim(), "slave");
    if (!text) {
      toast.error("Write your response");
      return;
    }
    setResponding(mission.id);
    const supabase = createClient();
    const { error } = await supabase.rpc("complete_jealousy_mission", {
      p_mission_id: mission.id,
      p_response: text,
    });
    setResponding(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Mission submitted — consequences applied");
    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Jealousy mission completed",
        body: text.slice(0, 120),
        url: jealousyPageHref(mission.id),
        target: "queen",
        kind: "jealousy_mission_done",
      })
    );
    void load();
  };

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-2xl text-ivory sm:text-3xl">
          <HeartCrack className="h-7 w-7 text-gold" />
          Jealousy
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Rival fantasies and jealousy missions — written reactions that feed denial"
            : "Answer Queen’s prompts. Completing may add denial days or edge debt."}
        </p>
      </div>

      {isQueen && <RivalFantasyPanel onCreated={() => void load()} />}

      <section className="space-y-4">
        <h2 className="font-heading text-xl text-gold">Missions</h2>
      {items.length === 0 ? (
        <div className="rounded-xl border border-gold/15 bg-charcoal/60 px-6 py-10 text-center text-sm text-muted-foreground">
          No jealousy missions yet.
          {isQueen ? " Assign one from a flirt guy or date." : ""}
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((m) => (
            <li
              key={m.id}
              id={`jealousy-mission-${m.id}`}
              className={cn(
                "space-y-3 rounded-xl border bg-charcoal/80 p-4 sm:p-5",
                m.id === focusId ? "border-gold/40" : "border-gold/15"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] uppercase tracking-wider",
                    m.status === "open"
                      ? "border-gold/50 text-gold"
                      : m.status === "completed"
                        ? "border-emerald-500/40 text-emerald-300"
                        : "border-muted text-muted-foreground"
                  )}
                >
                  {m.status}
                </Badge>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {m.source_type === "flirt_guy" ? "Flirt" : "Date"}
                </Badge>
                {m.source_label && (
                  <Link
                    href={sourceHref(m)}
                    className="text-sm text-gold underline-offset-2 hover:underline"
                  >
                    {m.source_label}
                  </Link>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatRelative(m.created_at)}
                </span>
                {(m.denial_days > 0 || m.edge_debt > 0) && (
                  <span className="text-xs text-muted-foreground">
                    {m.denial_days > 0 ? `+${m.denial_days}d denial` : ""}
                    {m.denial_days > 0 && m.edge_debt > 0 ? " · " : ""}
                    {m.edge_debt > 0 ? `+${m.edge_debt} edges` : ""}
                  </span>
                )}
              </div>

              <p className="text-sm leading-relaxed text-ivory/90">
                <RoleSpeech text={m.prompt} role="queen" />
              </p>

              {m.status === "completed" && m.response_text && (
                <div className="rounded-lg border border-gold/10 bg-void/40 p-3 text-sm text-ivory/85">
                  <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Response
                  </p>
                  <RoleSpeech text={m.response_text} role="slave" />
                </div>
              )}

              {isSlave && m.status === "open" && (
                <div className="space-y-2">
                  <Textarea
                    value={drafts[m.id] ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [m.id]: e.target.value }))
                    }
                    rows={4}
                    placeholder="Write your reaction…"
                    className="border-gold/20 bg-void/60"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={responding === m.id}
                    onClick={() => void complete(m)}
                    className="bg-gold text-void hover:bg-gold-muted"
                  >
                    {responding === m.id ? (
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-3.5 w-3.5" />
                    )}
                    Submit mission
                  </Button>
                </div>
              )}

              <JealousyMissionCommentThread
                missionId={m.id}
                missionLabel={m.source_label}
                highlightCommentId={
                  m.id === focusId ? focusCommentId : null
                }
              />
            </li>
          ))}
        </ul>
      )}
      </section>
    </div>
  );
}

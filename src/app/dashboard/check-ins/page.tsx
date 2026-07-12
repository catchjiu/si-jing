"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlarmClock, Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { syncProtocolState } from "@/lib/protocol";
import { formatDeadline, formatRelative } from "@/lib/format";
import { formatRoleSpeech } from "@/lib/role-speech";
import type { CheckIn, Profile } from "@/lib/types";
import { VoiceNotes } from "@/components/voice/voice-notes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RoleSpeech } from "@/components/ui/role-speech";

function statusClass(status: CheckIn["status"]) {
  if (status === "open") return "border-gold/50 text-gold";
  if (status === "completed") return "border-emerald-500/40 text-emerald-300";
  if (status === "missed") return "border-red-500/40 text-red-300";
  return "border-muted text-muted-foreground";
}

export default function CheckInsPage() {
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [items, setItems] = useState<CheckIn[]>([]);
  const [recipient, setRecipient] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [windowMinutes, setWindowMinutes] = useState("30");
  const [openNow, setOpenNow] = useState(true);
  const [opensAtLocal, setOpensAtLocal] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>(
    {}
  );
  const [responding, setResponding] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    await syncProtocolState(supabase);

    let query = supabase
      .from("check_ins")
      .select("*")
      .order("opens_at", { ascending: false });

    if (isSlave) {
      query = query.eq("assigned_to", profile.id);
    }

    const { data } = await query;
    setItems((data ?? []) as CheckIn[]);
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!isQueen) return;
    const findRecipient = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("role", "slave")
        .limit(1)
        .maybeSingle();
      setRecipient((data as Profile | null) ?? null);
    };
    void findRecipient();
  }, [isQueen]);

  const createCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile || !recipient) return;
    const minutes = parseInt(windowMinutes, 10);
    if (!title.trim() || !minutes || minutes < 1) {
      toast.error("Title and window minutes required");
      return;
    }

    const opens = openNow
      ? new Date()
      : opensAtLocal
        ? new Date(opensAtLocal)
        : null;
    if (!opens || Number.isNaN(opens.getTime())) {
      toast.error("Pick a valid open time");
      return;
    }
    const closes = new Date(opens.getTime() + minutes * 60 * 1000);

    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.from("check_ins").insert({
      created_by: profile.id,
      assigned_to: recipient.id,
      title: formatRoleSpeech(title.trim(), "queen"),
      prompt: prompt.trim()
        ? formatRoleSpeech(prompt.trim(), "queen")
        : null,
      window_minutes: minutes,
      opens_at: opens.toISOString(),
      closes_at: closes.toISOString(),
      status: openNow ? "open" : "scheduled",
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Check-in created");
    setTitle("");
    setPrompt("");
    void load();
  };

  const respond = async (checkIn: CheckIn) => {
    if (!isSlave || !profile) return;
    const text = formatRoleSpeech(
      (responseDrafts[checkIn.id] ?? "").trim(),
      "slave"
    );
    if (!text) {
      toast.error("Write a response");
      return;
    }
    setResponding(checkIn.id);
    const supabase = createClient();
    const { error } = await supabase
      .from("check_ins")
      .update({
        response_text: text,
        responded_at: new Date().toISOString(),
        status: "completed",
      })
      .eq("id", checkIn.id)
      .eq("status", "open");
    setResponding(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Check-in submitted");
    void load();
  };

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-3xl text-ivory">
          <AlarmClock className="h-7 w-7 text-gold" />
          Check-ins
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Timed windows — missed ones create a pending punishment"
            : "Report before the window closes"}
        </p>
      </div>

      {isQueen && recipient && (
        <form
          onSubmit={createCheckIn}
          className="space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-6"
        >
          <h2 className="font-heading text-xl text-gold">New check-in</h2>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border-gold/20 bg-void/60"
              placeholder="Where are you?"
            />
          </div>
          <div className="space-y-2">
            <Label>Prompt (optional)</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              className="border-gold/20 bg-void/60"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Window (minutes)</Label>
              <Input
                type="number"
                min={1}
                value={windowMinutes}
                onChange={(e) => setWindowMinutes(e.target.value)}
                className="border-gold/20 bg-void/60"
              />
            </div>
            <div className="space-y-2">
              <Label>When</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={openNow ? "default" : "outline"}
                  className={
                    openNow
                      ? "bg-gold text-void hover:bg-gold-muted"
                      : "border-muted"
                  }
                  onClick={() => setOpenNow(true)}
                >
                  Open now
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={!openNow ? "default" : "outline"}
                  className={
                    !openNow
                      ? "bg-gold text-void hover:bg-gold-muted"
                      : "border-muted"
                  }
                  onClick={() => setOpenNow(false)}
                >
                  Schedule
                </Button>
              </div>
              {!openNow && (
                <Input
                  type="datetime-local"
                  value={opensAtLocal}
                  onChange={(e) => setOpensAtLocal(e.target.value)}
                  className="border-gold/20 bg-void/60"
                />
              )}
            </div>
          </div>
          <Button
            type="submit"
            disabled={submitting}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Create check-in
          </Button>
        </form>
      )}

      <section className="space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No check-ins yet.</p>
        ) : (
          items.map((c) => (
            <article
              key={c.id}
              className={cn(
                "rounded-xl border bg-charcoal/80 p-5",
                c.status === "open" ? "border-gold/40" : "border-gold/15"
              )}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-heading text-lg text-ivory">
                  <RoleSpeech text={c.title} role="queen" />
                </h3>
                <Badge variant="outline" className={statusClass(c.status)}>
                  {c.status}
                </Badge>
              </div>
              {c.prompt && (
                <p className="mb-2 text-sm text-ivory/75 whitespace-pre-wrap">
                  <RoleSpeech text={c.prompt} role="queen" />
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Opens {formatDeadline(c.opens_at)} · Closes{" "}
                {formatDeadline(c.closes_at)}
              </p>
              {c.response_text && (
                <div className="mt-3 rounded-lg border border-gold/10 bg-void/40 p-3 text-sm text-ivory/85">
                  <p className="mb-1 text-xs text-muted-foreground">
                    Response · {c.responded_at && formatRelative(c.responded_at)}
                  </p>
                  <p className="whitespace-pre-wrap">
                    <RoleSpeech text={c.response_text} role="slave" />
                  </p>
                </div>
              )}
              {isSlave && c.status === "open" && (
                <div className="mt-4 space-y-3">
                  <Textarea
                    value={responseDrafts[c.id] ?? ""}
                    onChange={(e) =>
                      setResponseDrafts((prev) => ({
                        ...prev,
                        [c.id]: e.target.value,
                      }))
                    }
                    placeholder="Your report…"
                    rows={3}
                    className="border-gold/20 bg-void/60"
                  />
                  <Button
                    onClick={() => void respond(c)}
                    disabled={responding === c.id}
                    className="bg-gold text-void hover:bg-gold-muted"
                  >
                    {responding === c.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Submit report
                  </Button>
                </div>
              )}
              {(c.status === "open" || c.status === "completed") && (
                <div className="mt-4 border-t border-gold/10 pt-4">
                  <VoiceNotes
                    entityType="check_in"
                    entityId={c.id}
                    compact
                    title="Voice"
                  />
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </div>
  );
}

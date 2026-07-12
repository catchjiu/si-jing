"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { formatRelative } from "@/lib/format";
import type { ProtocolRule, RuleAcknowledgment } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export default function ProtocolPage() {
  const { profile, isQueen, isSlave, loading: authLoading } = useAuth();
  const [rules, setRules] = useState<ProtocolRule[]>([]);
  const [acks, setAcks] = useState<RuleAcknowledgment[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [{ data: rulesData }, { data: acksData }] = await Promise.all([
      supabase
        .from("rules")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase.from("rule_acknowledgments").select("*"),
    ]);
    setRules((rulesData ?? []) as ProtocolRule[]);
    setAcks((acksData ?? []) as RuleAcknowledgment[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading && profile) void load();
  }, [authLoading, profile, load]);

  const createRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile) return;
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body required");
      return;
    }
    setBusy("create");
    const supabase = createClient();
    const { error } = await supabase.from("rules").insert({
      created_by: profile.id,
      title: title.trim(),
      body: body.trim(),
      sort_order: rules.length,
      is_active: true,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Rule posted");
    setTitle("");
    setBody("");
    void load();
  };

  const toggleActive = async (rule: ProtocolRule) => {
    if (!isQueen) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("rules")
      .update({ is_active: !rule.is_active, updated_at: new Date().toISOString() })
      .eq("id", rule.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    void load();
  };

  const removeRule = async (id: string) => {
    if (!isQueen) return;
    const supabase = createClient();
    const { error } = await supabase.from("rules").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Rule removed");
    void load();
  };

  const acknowledge = async (ruleId: string) => {
    if (!isSlave || !profile) return;
    setBusy(ruleId);
    const supabase = createClient();
    const existing = acks.find(
      (a) => a.rule_id === ruleId && a.user_id === profile.id
    );
    if (existing) {
      const { error } = await supabase
        .from("rule_acknowledgments")
        .update({ acknowledged_at: new Date().toISOString() })
        .eq("id", existing.id);
      setBusy(null);
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("rule_acknowledgments").insert({
        rule_id: ruleId,
        user_id: profile.id,
      });
      setBusy(null);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    toast.success("Acknowledged");
    void load();
  };

  const ackFor = (ruleId: string) =>
    acks.find((a) => a.rule_id === ruleId && a.user_id === profile?.id);

  const activeRules = rules.filter((r) => r.is_active);
  const visible = isQueen ? rules : activeRules;

  if (authLoading || loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading flex items-center gap-3 text-3xl text-ivory">
          <BookOpen className="h-7 w-7 text-gold" />
          Protocol
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isQueen
            ? "Standing rules D must acknowledge"
            : "Read and acknowledge Queen’s standing rules"}
        </p>
      </div>

      {isQueen && (
        <form
          onSubmit={createRule}
          className="space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-6"
        >
          <h2 className="font-heading text-xl text-gold">Post a rule</h2>
          <div className="space-y-2">
            <Label htmlFor="rule-title">Title</Label>
            <Input
              id="rule-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border-gold/20 bg-void/60"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rule-body">Body</Label>
            <Textarea
              id="rule-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="border-gold/20 bg-void/60"
            />
          </div>
          <Button
            type="submit"
            disabled={busy === "create"}
            className="bg-gold text-void hover:bg-gold-muted"
          >
            {busy === "create" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Post rule
          </Button>
        </form>
      )}

      <section className="space-y-4">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules yet.</p>
        ) : (
          visible.map((rule) => {
            const ack = ackFor(rule.id);
            const needsAck = isSlave && rule.is_active && !ack;
            return (
              <article
                key={rule.id}
                className={cn(
                  "rounded-xl border bg-charcoal/80 p-5",
                  needsAck ? "border-gold/50" : "border-gold/15"
                )}
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-heading text-lg text-ivory">{rule.title}</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {!rule.is_active && (
                      <Badge variant="outline" className="border-muted text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                    {ack && (
                      <Badge
                        variant="outline"
                        className="border-gold/40 text-gold"
                      >
                        Ack · {formatRelative(ack.acknowledged_at)}
                      </Badge>
                    )}
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ivory/80">
                  {rule.body}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {isSlave && rule.is_active && (
                    <Button
                      size="sm"
                      onClick={() => void acknowledge(rule.id)}
                      disabled={busy === rule.id}
                      className="bg-gold text-void hover:bg-gold-muted"
                    >
                      {busy === rule.id ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-3.5 w-3.5" />
                      )}
                      {ack ? "Re-acknowledge" : "I acknowledge"}
                    </Button>
                  )}
                  {isQueen && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void toggleActive(rule)}
                        className="border-muted"
                      >
                        {rule.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void removeRule(rule.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

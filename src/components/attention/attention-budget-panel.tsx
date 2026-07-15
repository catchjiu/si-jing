"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare, Plus, Ticket } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  fetchAttentionBudget,
  grantSpeakFreelyTokens,
  loadAttentionSettings,
  saveAttentionSettings,
  type AttentionBudget,
  type AttentionBudgetSettings,
} from "@/lib/attention-budget";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = { className?: string };

export function AttentionBudgetPanel({ className }: Props) {
  const { profile, isQueen, isSlave } = useAuth();
  const [budget, setBudget] = useState<AttentionBudget | null>(null);
  const [settings, setSettings] = useState<AttentionBudgetSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [b, s] = await Promise.all([
      fetchAttentionBudget(supabase),
      isQueen ? loadAttentionSettings(supabase) : Promise.resolve(null),
    ]);
    setBudget(b);
    if (s) setSettings(s);
    setLoading(false);
  }, [isQueen]);

  useEffect(() => {
    if (!profile) return;
    void load();
  }, [profile, load]);

  if (!profile || loading) {
    return (
      <div
        className={cn(
          "rounded-xl border border-gold/15 bg-charcoal/80 p-4",
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isSlave && budget) {
    return (
      <div
        className={cn(
          "rounded-xl border border-gold/15 bg-charcoal/80 p-4 sm:p-5",
          className
        )}
      >
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gold" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Attention budget
            </p>
            <p className="font-heading text-lg text-ivory">Today&apos;s allowance</p>
          </div>
        </div>
        {!budget.enabled ? (
          <p className="text-sm text-muted-foreground">No daily limits right now.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-gold/10 bg-void/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Messages left
              </p>
              <p className="font-heading text-2xl text-gold tabular-nums">
                {budget.messages_remaining}
                <span className="text-sm text-muted-foreground">
                  /{budget.daily_message_limit}
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-gold/10 bg-void/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Requests left
              </p>
              <p className="font-heading text-2xl text-gold tabular-nums">
                {budget.requests_remaining}
                <span className="text-sm text-muted-foreground">
                  /{budget.daily_request_limit}
                </span>
              </p>
            </div>
            <div className="col-span-2 flex items-center gap-2 rounded-lg border border-gold/10 bg-void/40 px-3 py-2">
              <Ticket className="h-4 w-4 text-gold" />
              <p className="text-sm text-ivory/80">
                Speak-freely tokens:{" "}
                <span className="font-medium text-gold">
                  {budget.speak_freely_tokens}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!isQueen || !settings) return null;

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    const supabase = createClient();
    const result = await saveAttentionSettings(supabase, settings, profile.id);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Attention budget updated");
    void load();
  };

  const grantToken = async () => {
    setSaving(true);
    const supabase = createClient();
    const result = await grantSpeakFreelyTokens(supabase, 1);
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Speak-freely token granted (${result.tokens} total)`);
    void load();
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-gold/15 bg-charcoal/80 p-4 sm:p-5",
        className
      )}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-gold" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Attention budget
            </p>
            <p className="font-heading text-lg text-ivory">Daily caps for D</p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="border-gold/30 text-gold"
          disabled={saving}
          onClick={() => void grantToken()}
        >
          <Plus className="h-3.5 w-3.5" />
          Speak freely
        </Button>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          onClick={() =>
            setSettings((s) => (s ? { ...s, enabled: !s.enabled } : s))
          }
          className={cn(
            "relative h-6 w-11 rounded-full border transition-colors",
            settings.enabled
              ? "border-gold/50 bg-gold/30"
              : "border-gold/15 bg-void"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-ivory transition-all",
              settings.enabled ? "left-6" : "left-0.5"
            )}
          />
        </button>
        <span className="text-sm text-ivory/80">
          {settings.enabled ? "Limits on" : "Limits off"}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          Tokens: {settings.speak_freely_tokens}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="msg-limit">Daily messages</Label>
          <Input
            id="msg-limit"
            type="number"
            min={0}
            max={100}
            value={settings.daily_message_limit}
            onChange={(e) =>
              setSettings((s) =>
                s
                  ? {
                      ...s,
                      daily_message_limit: Math.max(
                        0,
                        Number(e.target.value) || 0
                      ),
                    }
                  : s
              )
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="req-limit">Daily requests</Label>
          <Input
            id="req-limit"
            type="number"
            min={0}
            max={50}
            value={settings.daily_request_limit}
            onChange={(e) =>
              setSettings((s) =>
                s
                  ? {
                      ...s,
                      daily_request_limit: Math.max(
                        0,
                        Number(e.target.value) || 0
                      ),
                    }
                  : s
              )
            }
          />
        </div>
      </div>

      <Button
        type="button"
        className="mt-4 w-full sm:w-auto"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save limits
      </Button>
    </div>
  );
}

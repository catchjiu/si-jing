"use client";

import { useState } from "react";
import { toast } from "sonner";
import { HeartCrack, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { JealousyMissionSourceType } from "@/lib/types";
import { formatRoleSpeech } from "@/lib/role-speech";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PROMPT_PRESETS = [
  "Write what you'd do if I went home with him tonight.",
  "How does knowing I flirted with him make you feel? Be specific.",
  "Rank yourself against him — and explain why you lose.",
  "What would you beg me for if I told you I almost fucked him?",
];

type JealousyMissionFormProps = {
  sourceType: JealousyMissionSourceType;
  sourceId: string;
  sourceLabel?: string | null;
  onCreated?: () => void;
  className?: string;
};

export function JealousyMissionForm({
  sourceType,
  sourceId,
  sourceLabel,
  onCreated,
  className,
}: JealousyMissionFormProps) {
  const { isQueen } = useAuth();
  const [prompt, setPrompt] = useState(PROMPT_PRESETS[0]!);
  const [denialDays, setDenialDays] = useState("0");
  const [edgeDebt, setEdgeDebt] = useState("0");
  const [submitting, setSubmitting] = useState(false);

  if (!isQueen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.error("Write a prompt");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_jealousy_mission", {
      p_source_type: sourceType,
      p_source_id: sourceId,
      p_prompt: formatRoleSpeech(trimmed, "queen"),
      p_source_label: sourceLabel ?? null,
      p_denial_days: Math.max(0, parseInt(denialDays, 10) || 0),
      p_edge_debt: Math.max(0, parseInt(edgeDebt, 10) || 0),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    void import("@/lib/push-client").then(({ notifyPush }) =>
      notifyPush({
        title: "Jealousy mission",
        body: trimmed.slice(0, 120),
        url: `/dashboard/jealousy?mission=${data}`,
        target: "slave",
        kind: "jealousy_mission",
      })
    );
    toast.success("Mission assigned");
    onCreated?.();
  };

  return (
    <form
      onSubmit={submit}
      className={
        className ??
        "space-y-3 rounded-xl border border-gold/15 bg-charcoal/70 p-4"
      }
    >
      <p className="font-heading flex items-center gap-2 text-gold">
        <HeartCrack className="h-4 w-4" />
        Jealousy mission
      </p>
      <div className="space-y-2">
        <Label>Prompt preset</Label>
        <Select
          value={PROMPT_PRESETS.includes(prompt) ? prompt : "__custom__"}
          onValueChange={(v) => {
            if (v !== "__custom__") setPrompt(v);
          }}
        >
          <SelectTrigger className="border-gold/20 bg-void/60">
            <SelectValue placeholder="Choose a prompt" />
          </SelectTrigger>
          <SelectContent>
            {PROMPT_PRESETS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
            <SelectItem value="__custom__">Custom…</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`jm-prompt-${sourceId}`}>Prompt</Label>
        <Textarea
          id={`jm-prompt-${sourceId}`}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          className="border-gold/20 bg-void/60"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`jm-days-${sourceId}`}>Denial days on complete</Label>
          <Input
            id={`jm-days-${sourceId}`}
            type="number"
            min={0}
            max={60}
            value={denialDays}
            onChange={(e) => setDenialDays(e.target.value)}
            className="border-gold/20 bg-void/60"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`jm-edges-${sourceId}`}>Edge debt on complete</Label>
          <Input
            id={`jm-edges-${sourceId}`}
            type="number"
            min={0}
            max={50}
            value={edgeDebt}
            onChange={(e) => setEdgeDebt(e.target.value)}
            className="border-gold/20 bg-void/60"
          />
        </div>
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={submitting}
        className="bg-gold text-void hover:bg-gold-muted"
      >
        {submitting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
        Assign mission
      </Button>
    </form>
  );
}

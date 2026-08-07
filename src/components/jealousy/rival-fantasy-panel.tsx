"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Flame, HeartCrack, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import type { FlirtGuy } from "@/lib/types";
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

const FANTASY_TEMPLATES = [
  "He’d last longer than you. Write a short story where I choose {name} over you tonight.",
  "Describe watching me flirt with {name} — what you’d do, what you’d beg for, and why you stay.",
  "Write the fantasy: {name} takes me home while you wait. Be specific, filthy, and grateful.",
  "Compare yourself to {name} in detail. End with why I should keep you as the weaker option.",
  "I text {name} that I’m wet for him. Write your reaction as a short story I’ll read to him.",
  "Write {name} fucking me in a hotel I never tell you about — slow, possessive, like he’s rewriting my body so you never fit again.",
  "Imagine I send you a photo of {name}’s hand on my thigh. Turn it into a short filthy story of what happens next without you.",
  "Script the night I let {name} use my mouth. You’re listening on speaker — narrate every detail and your place in it.",
  "Write how {name} ruins me better than you ever could. End with you asking permission to clean me up.",
  "Write {name} whispering that I already belong to him while he finishes inside me — then him telling me to go home and act normal around you.",
];

type RivalFantasyPanelProps = {
  onCreated?: () => void;
};

function fillTemplate(template: string, name: string): string {
  return template.replaceAll("{name}", name.trim() || "him");
}

export function RivalFantasyPanel({ onCreated }: RivalFantasyPanelProps) {
  const { isQueen } = useAuth();
  const [guys, setGuys] = useState<FlirtGuy[]>([]);
  const [guyId, setGuyId] = useState<string>("");
  const [template, setTemplate] = useState(FANTASY_TEMPLATES[0]!);
  const [prompt, setPrompt] = useState("");
  const [denialDays, setDenialDays] = useState("0");
  const [edgeDebt, setEdgeDebt] = useState("1");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const selectedGuy = useMemo(
    () => guys.find((g) => g.id === guyId) ?? null,
    [guys, guyId]
  );

  const loadGuys = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("flirt_guys")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    const rows = (data as FlirtGuy[]) ?? [];
    setGuys(rows);
    if (!guyId && rows[0]) setGuyId(rows[0].id);
    setLoading(false);
  }, [guyId]);

  useEffect(() => {
    if (isQueen) void loadGuys();
  }, [isQueen, loadGuys]);

  useEffect(() => {
    if (!selectedGuy || template === "__custom__") return;
    setPrompt(fillTemplate(template, selectedGuy.name));
  }, [selectedGuy, template]);

  if (!isQueen) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGuy) {
      toast.error("Pick a flirt rival first");
      return;
    }
    const trimmed = prompt.trim();
    if (!trimmed) {
      toast.error("Write or pick a fantasy prompt");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_jealousy_mission", {
      p_source_type: "flirt_guy",
      p_source_id: selectedGuy.id,
      p_prompt: formatRoleSpeech(trimmed, "queen"),
      p_source_label: selectedGuy.name,
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
        title: "Rival fantasy assigned",
        body: `${selectedGuy.name}: ${trimmed.slice(0, 100)}`,
        url: `/dashboard/jealousy?mission=${data}`,
        target: "slave",
        kind: "jealousy_mission",
      })
    );
    toast.success("Rival fantasy assigned");
    onCreated?.();
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-5 sm:p-6"
    >
      <div>
        <h2 className="font-heading flex items-center gap-2 text-xl text-gold">
          <Flame className="h-5 w-5" />
          Rival fantasy generator
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a flirt rival and a filthy prompt — D must expand it into a short
          story for You.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading rivals…</p>
      ) : guys.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add a flirt guy first, then come back to assign a fantasy.
        </p>
      ) : (
        <>
          <div className="space-y-2">
            <Label>Rival</Label>
            <Select value={guyId} onValueChange={setGuyId}>
              <SelectTrigger className="border-gold/20 bg-void/60">
                <SelectValue placeholder="Choose a guy" />
              </SelectTrigger>
              <SelectContent>
                {guys.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Suggested prompt</Label>
            <Select
              value={
                FANTASY_TEMPLATES.includes(template) ? template : "__custom__"
              }
              onValueChange={(v) => {
                setTemplate(v);
              }}
            >
              <SelectTrigger className="border-gold/20 bg-void/60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FANTASY_TEMPLATES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {selectedGuy
                      ? fillTemplate(t, selectedGuy.name)
                      : t.replaceAll("{name}", "him")}
                  </SelectItem>
                ))}
                <SelectItem value="__custom__">Custom…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rival-fantasy-prompt">Prompt for D</Label>
            <Textarea
              id="rival-fantasy-prompt"
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setTemplate("__custom__");
              }}
              rows={4}
              className="border-gold/20 bg-void/60"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="rival-denial-days">Denial days on complete</Label>
              <Input
                id="rival-denial-days"
                type="number"
                min={0}
                max={60}
                value={denialDays}
                onChange={(e) => setDenialDays(e.target.value)}
                className="border-gold/20 bg-void/60"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rival-edge-debt">Edge debt on complete</Label>
              <Input
                id="rival-edge-debt"
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
            disabled={submitting || !selectedGuy}
            className="w-full bg-gold text-void hover:bg-gold-muted"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <HeartCrack className="mr-2 h-4 w-4" />
            )}
            Assign rival fantasy
          </Button>
        </>
      )}
    </form>
  );
}

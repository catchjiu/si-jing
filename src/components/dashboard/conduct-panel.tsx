"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { useConduct } from "@/contexts/conduct-context";
import {
  CONDUCT_STEPS,
  conductMeta,
  saveConductLevel,
  type ConductLevel,
} from "@/lib/conduct";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

type Props = {
  className?: string;
};

export function ConductPanel({ className }: Props) {
  const { profile, isQueen } = useAuth();
  const { level, loading, setLevelLocal, blursMedia } = useConduct();
  const [draft, setDraft] = useState<ConductLevel | null>(null);
  const [saving, setSaving] = useState(false);

  const shown = draft ?? level;
  const meta = conductMeta(shown);

  const commit = async (next: ConductLevel) => {
    if (!profile || !isQueen) return;
    setSaving(true);
    const supabase = createClient();
    try {
      await saveConductLevel(supabase, next, profile.id);
      setLevelLocal(next);
      setDraft(null);
      toast.success(
        next === 0
          ? "Bad boy — all pictures are blurred"
          : `Conduct: ${conductMeta(next).label}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        className={cn(
          "rounded-xl border border-gold/15 bg-charcoal/80 p-4 sm:p-5",
          className
        )}
      >
        <p className="text-sm text-muted-foreground">Loading conduct…</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-xl border bg-charcoal/80 p-4 sm:p-5",
        blursMedia || shown === 0
          ? "border-red-500/35"
          : "border-gold/15",
        className
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Conduct
          </p>
          <p className="font-heading text-lg text-ivory">
            Bad boy → Good boy
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isQueen
              ? "Set his standing. Bad boy blurs every picture on the site."
              : "Queen’s verdict on how you’re behaving."}
          </p>
        </div>
        <ShieldAlert
          className={cn(
            "size-5 shrink-0",
            shown === 0 ? "text-red-400" : "text-gold/70"
          )}
        />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p
            className={cn(
              "font-heading text-2xl",
              shown === 0 ? "text-red-300" : "text-gold"
            )}
          >
            {meta.label}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{meta.hint}</p>
        </div>
        {saving ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {isQueen ? (
        <div className="mt-4 space-y-3">
          <Label className="sr-only">Conduct level</Label>
          <Slider
            min={0}
            max={4}
            step={1}
            value={[shown]}
            onValueChange={(v) => setDraft((v[0] ?? 4) as ConductLevel)}
            onValueCommit={(v) => void commit((v[0] ?? 4) as ConductLevel)}
            className="w-full"
          />
          <div className="flex justify-between gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            {CONDUCT_STEPS.map((s) => (
              <span
                key={s.level}
                className={cn(
                  "min-w-0 flex-1 text-center",
                  s.level === shown &&
                    (s.level === 0 ? "text-red-300" : "text-gold")
                )}
              >
                {s.level === 0
                  ? "Bad"
                  : s.level === 4
                    ? "Good"
                    : s.label.slice(0, 3)}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-1.5">
          {CONDUCT_STEPS.map((s) => (
            <div
              key={s.level}
              className={cn(
                "h-2 flex-1 rounded-full",
                s.level <= shown
                  ? s.level === 0 && shown === 0
                    ? "bg-red-500/70"
                    : "bg-gold/70"
                  : "bg-void/80"
              )}
              title={s.label}
            />
          ))}
        </div>
      )}
    </div>
  );
}

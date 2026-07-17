"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Ruler } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import {
  SIZE_CHART_CM_KEYS,
  SIZE_CHART_FIELDS,
  chartToDraft,
  displaySizeChartValue,
  draftHasCmMeasurements,
  emptySizeChartDraft,
  fetchPrimaryQueenId,
  fetchQueenSizeChart,
  formatSizeChartForCopy,
  hasAnySizeChartValue,
  saveQueenSizeChart,
  valueHasCm,
} from "@/lib/queen-size-chart";
import type { QueenSizeChartDraft } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function WishlistSizeChart() {
  const { profile, isQueen } = useAuth();
  const [draft, setDraft] = useState<QueenSizeChartDraft>(emptySizeChartDraft());
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showInches, setShowInches] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    try {
      const queenId = isQueen
        ? profile.id
        : await fetchPrimaryQueenId(supabase);
      if (!queenId) {
        setDraft(emptySizeChartDraft());
        return;
      }
      const chart = await fetchQueenSizeChart(supabase, queenId);
      setDraft(chartToDraft(chart));
      setUpdatedAt(chart?.updated_at ?? null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not load size chart"
      );
    } finally {
      setLoading(false);
    }
  }, [profile, isQueen]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateField = (key: keyof QueenSizeChartDraft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = async () => {
    if (!profile || !isQueen) return;
    setSaving(true);
    const supabase = createClient();
    try {
      const saved = await saveQueenSizeChart(supabase, profile.id, draft);
      setDraft(chartToDraft(saved));
      setUpdatedAt(saved.updated_at);
      setEditing(false);
      toast.success("Size chart saved");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not save size chart"
      );
    } finally {
      setSaving(false);
    }
  };

  const copyAll = async () => {
    if (!hasAnySizeChartValue(draft)) return;
    try {
      await navigator.clipboard.writeText(
        formatSizeChartForCopy(draft, showInches)
      );
      setCopied(true);
      toast.success("Sizes copied");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy sizes");
    }
  };

  const canToggleUnits = draftHasCmMeasurements(draft);
  const toggleUnits = () => {
    if (!canToggleUnits) return;
    setShowInches((prev) => !prev);
  };

  const showEdit = isQueen && (editing || !hasAnySizeChartValue(draft));

  return (
    <div className="rounded-xl border border-gold/20 bg-charcoal/70 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-void/40 text-gold">
            <Ruler className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Size chart
            </p>
            <h2 className="font-heading text-lg text-ivory">
              {isQueen ? "Your measurements" : "Her sizes"}
            </h2>
            {updatedAt ? (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Updated {formatRelative(updatedAt)}
              </p>
            ) : null}
            {!showEdit && canToggleUnits ? (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Tap a cm measurement to switch to{" "}
                {showInches ? "cm" : "inches"}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!showEdit && hasAnySizeChartValue(draft) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-gold/30 text-gold"
              onClick={() => void copyAll()}
            >
              {copied ? (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5" />
              )}
              {copied ? "Copied" : "Copy all"}
            </Button>
          ) : null}
          {isQueen && !showEdit ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-gold/25"
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : showEdit ? (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SIZE_CHART_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Input
                  value={draft[key]}
                  onChange={(e) => updateField(key, e.target.value)}
                  placeholder={placeholder}
                  className="border-gold/20 bg-void/60"
                />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Fit notes (optional)
            </Label>
            <Textarea
              value={draft.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              placeholder="Preferred brands, fit notes, US vs EU sizing…"
              rows={3}
              className="border-gold/20 bg-void/60"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={saving}
              className="bg-gold text-void hover:bg-gold-muted"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save size chart"
              )}
            </Button>
            {hasAnySizeChartValue(draft) ? (
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setEditing(false);
                  void load();
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      ) : hasAnySizeChartValue(draft) ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SIZE_CHART_FIELDS.filter(({ key }) => draft[key].trim()).map(
            ({ key, label }) => {
              const raw = draft[key];
              const isCmField =
                SIZE_CHART_CM_KEYS.includes(key) && valueHasCm(raw);
              const display = displaySizeChartValue(raw, showInches);
              const tileClass =
                "rounded-lg border border-gold/10 bg-void/40 px-3 py-2 text-left w-full";

              if (isCmField) {
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={toggleUnits}
                    className={cn(
                      tileClass,
                      "transition-colors hover:border-gold/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gold/40"
                    )}
                    title={
                      showInches
                        ? "Show all measurements in cm"
                        : "Show all measurements in inches"
                    }
                  >
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {label}
                    </p>
                    <p className="mt-0.5 text-sm text-ivory">{display}</p>
                  </button>
                );
              }

              return (
                <div key={key} className={tileClass}>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-0.5 text-sm text-ivory">{display}</p>
                </div>
              );
            }
          )}
        </div>
      ) : (
        <p className={cn("mt-4 text-sm text-muted-foreground")}>
          {isQueen
            ? "Add your sizes so D can buy gifts that fit."
            : "Queen has not added her sizes yet."}
        </p>
      )}

      {!showEdit && draft.notes.trim() ? (
        <div className="mt-4 rounded-lg border border-gold/10 bg-void/40 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Fit notes
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ivory/90">
            {draft.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}

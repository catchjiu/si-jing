"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Loader2,
  Shirt,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { downsizeImageIfNeeded } from "@/lib/image-compress";
import { formatRoleSpeech } from "@/lib/role-speech";
import { jealousyPageHref } from "@/lib/inbox-deep-links";
import { presignAndUpload, signObjectUrl } from "@/lib/storage/client";
import type {
  JealousyOutfitOption,
  JealousyOutfitVetoWithUrls,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const DEFAULT_PROMPT =
  "I’m wearing {label} — the outfit you said would hurt most. Write what that does to you, filthy and grateful.";

type DraftOption = {
  key: string;
  file: File | null;
  preview: string | null;
  label: string;
};

type OutfitVetoPanelProps = {
  onChanged?: () => void;
  focusVetoId?: string | null;
};

function parseOptions(raw: unknown): JealousyOutfitOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => {
      if (!o || typeof o !== "object") return null;
      const row = o as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.image_path !== "string") {
        return null;
      }
      return {
        id: row.id,
        image_path: row.image_path,
        label: typeof row.label === "string" ? row.label : null,
      };
    })
    .filter(Boolean) as JealousyOutfitOption[];
}

export function OutfitVetoPanel({
  onChanged,
  focusVetoId = null,
}: OutfitVetoPanelProps) {
  const { isQueen, isSlave, profile } = useAuth();
  const [vetoes, setVetoes] = useState<JealousyOutfitVetoWithUrls[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<DraftOption[]>([
    { key: "a", file: null, preview: null, label: "" },
    { key: "b", file: null, preview: null, label: "" },
  ]);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [denialDays, setDenialDays] = useState("0");
  const [edgeDebt, setEdgeDebt] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const [rankingId, setRankingId] = useState<string | null>(null);
  const [rankOrders, setRankOrders] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from("jealousy_outfit_vetoes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(12);
    if (isSlave) query = query.eq("assigned_to", profile.id);
    const { data, error } = await query;
    if (error) {
      toast.error(error.message);
      setVetoes([]);
      setLoading(false);
      return;
    }
    const rows = (data ?? []).map((row) => ({
      ...(row as Omit<JealousyOutfitVetoWithUrls, "options">),
      options: parseOptions((row as { options: unknown }).options),
    }));
    const withUrls = await Promise.all(
      rows.map(async (v) => ({
        ...v,
        options: await Promise.all(
          v.options.map(async (o) => ({
            ...o,
            signedUrl:
              (await signObjectUrl({
                bucket: "jealousy",
                path: o.image_path,
                expiresIn: 3600,
              })) ?? undefined,
          }))
        ),
      }))
    );
    setVetoes(withUrls);
    setRankOrders((prev) => {
      const next = { ...prev };
      for (const v of withUrls) {
        if (!next[v.id]) {
          next[v.id] = v.options.map((o) => o.id);
        }
      }
      return next;
    });
    setLoading(false);
  }, [profile, isSlave]);

  useEffect(() => {
    if (isQueen || isSlave) void load();
  }, [isQueen, isSlave, load]);

  useEffect(() => {
    if (!focusVetoId || loading) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(`outfit-veto-${focusVetoId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [focusVetoId, loading]);

  const setDraftFile = (key: string, file: File | null) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.key !== key) return d;
        if (d.preview) URL.revokeObjectURL(d.preview);
        return {
          ...d,
          file,
          preview: file ? URL.createObjectURL(file) : null,
        };
      })
    );
  };

  const addDraftSlot = () => {
    if (drafts.length >= 3) return;
    setDrafts((prev) => [
      ...prev,
      { key: `c-${Date.now()}`, file: null, preview: null, label: "" },
    ]);
  };

  const removeDraftSlot = (key: string) => {
    if (drafts.length <= 2) return;
    setDrafts((prev) => {
      const row = prev.find((d) => d.key === key);
      if (row?.preview) URL.revokeObjectURL(row.preview);
      return prev.filter((d) => d.key !== key);
    });
  };

  const createVeto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isQueen || !profile) return;
    const filled = drafts.filter((d) => d.file);
    if (filled.length < 2 || filled.length > 3) {
      toast.error("Upload 2 or 3 outfit photos");
      return;
    }
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      toast.error("Write a mission prompt template");
      return;
    }
    setSubmitting(true);
    const supabase = createClient();
    try {
      const options: JealousyOutfitOption[] = [];
      for (const d of filled) {
        const file = d.file!;
        const uploadFile = await downsizeImageIfNeeded(file);
        const ext = uploadFile.name.split(".").pop() || "jpg";
        const optionId = crypto.randomUUID();
        const imagePath = await presignAndUpload({
          bucket: "jealousy",
          file: uploadFile,
          contentType: uploadFile.type || "image/jpeg",
          ext,
          relativePath: `${profile.id}/${optionId}.${ext}`,
        });
        options.push({
          id: optionId,
          image_path: imagePath,
          label: d.label.trim()
            ? formatRoleSpeech(d.label.trim(), "queen")
            : null,
        });
      }

      const { data, error } = await supabase.rpc("create_jealousy_outfit_veto", {
        p_options: options,
        p_prompt_template: formatRoleSpeech(trimmedPrompt, "queen"),
        p_denial_days: Math.max(0, parseInt(denialDays, 10) || 0),
        p_edge_debt: Math.max(0, parseInt(edgeDebt, 10) || 0),
      });
      if (error) throw error;

      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Outfit veto",
          body: "Rank which outfit would hurt most — Queen wears the winner.",
          url: `/dashboard/jealousy?veto=${data}`,
          target: "slave",
          kind: "outfit_veto",
        })
      );
      toast.success("Outfit veto sent");
      setDrafts([
        { key: "a", file: null, preview: null, label: "" },
        { key: "b", file: null, preview: null, label: "" },
      ]);
      setPrompt(DEFAULT_PROMPT);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create veto");
    } finally {
      setSubmitting(false);
    }
  };

  const moveRank = (vetoId: string, index: number, dir: -1 | 1) => {
    setRankOrders((prev) => {
      const order = [...(prev[vetoId] ?? [])];
      const next = index + dir;
      if (next < 0 || next >= order.length) return prev;
      const tmp = order[index]!;
      order[index] = order[next]!;
      order[next] = tmp;
      return { ...prev, [vetoId]: order };
    });
  };

  const submitRank = async (veto: JealousyOutfitVetoWithUrls) => {
    const order = rankOrders[veto.id] ?? veto.options.map((o) => o.id);
    if (order.length !== veto.options.length) {
      toast.error("Rank every outfit");
      return;
    }
    setRankingId(veto.id);
    const supabase = createClient();
    try {
      const { data, error } = await supabase.rpc("rank_jealousy_outfit_veto", {
        p_veto_id: veto.id,
        p_rank_order: order,
      });
      if (error) throw error;
      const winner = veto.options.find((o) => o.id === order[0]);
      toast.success(
        winner?.label
          ? `Locked — she’ll wear “${winner.label}”`
          : "Locked — she wears your #1 hurt pick"
      );
      void import("@/lib/push-client").then(({ notifyPush }) =>
        notifyPush({
          title: "Outfit veto ranked",
          body: winner?.label
            ? `D picked: ${winner.label}`
            : "D ranked your outfits",
          url: jealousyPageHref(data as string),
          target: "queen",
          kind: "outfit_veto_ranked",
        })
      );
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not lock ranking");
    } finally {
      setRankingId(null);
    }
  };

  if (!isQueen && !isSlave) return null;

  return (
    <div className="space-y-4">
      {isQueen && (
        <form
          onSubmit={createVeto}
          className="space-y-4 rounded-xl border border-gold/20 bg-charcoal/80 p-5 sm:p-6"
        >
          <div>
            <h2 className="font-heading flex items-center gap-2 text-xl text-gold">
              <Shirt className="h-5 w-5" />
              Outfit veto
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload 2–3 outfits. D ranks which would hurt most — You wear #1
              and lock a jealousy mission to that pick.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {drafts.map((d, idx) => (
              <div
                key={d.key}
                className="space-y-2 rounded-lg border border-gold/15 bg-void/40 p-3"
              >
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">
                    Outfit {idx + 1}
                  </Label>
                  {drafts.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeDraftSlot(d.key)}
                      className="text-muted-foreground hover:text-ivory"
                      aria-label="Remove outfit"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {d.preview ? (
                  <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-void">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={d.preview}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setDraftFile(d.key, null)}
                      className="absolute right-1.5 top-1.5 rounded-full bg-void/80 p-1"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-gold/25 hover:border-gold/50">
                    <ImagePlus className="h-6 w-6 text-gold/70" />
                    <span className="text-[11px] text-muted-foreground">
                      Add photo
                    </span>
                    <input
                      type="file"
                      accept={ACCEPTED.join(",")}
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f && ACCEPTED.includes(f.type)) setDraftFile(d.key, f);
                      }}
                    />
                  </label>
                )}
                <Input
                  value={d.label}
                  onChange={(e) =>
                    setDrafts((prev) =>
                      prev.map((x) =>
                        x.key === d.key ? { ...x, label: e.target.value } : x
                      )
                    )
                  }
                  placeholder="Label (optional)"
                  className="border-gold/20 bg-void/60 text-sm"
                />
              </div>
            ))}
          </div>

          {drafts.length < 3 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-gold/30"
              onClick={addDraftSlot}
            >
              Add third outfit
            </Button>
          )}

          <div className="space-y-2">
            <Label>Mission prompt after he ranks</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="border-gold/20 bg-void/60"
            />
            <p className="text-[11px] text-muted-foreground">
              Use {"{label}"} for the winning outfit name.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Denial days on complete</Label>
              <Input
                type="number"
                min={0}
                max={60}
                value={denialDays}
                onChange={(e) => setDenialDays(e.target.value)}
                className="border-gold/20 bg-void/60"
              />
            </div>
            <div className="space-y-1">
              <Label>Edge debt on complete</Label>
              <Input
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
            disabled={submitting}
            className="w-full bg-gold text-void hover:bg-gold-muted"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Shirt className="mr-2 h-4 w-4" />
            )}
            Send outfit veto
          </Button>
        </form>
      )}

      <section className="space-y-3">
        <h2 className="font-heading text-xl text-gold">
          {isQueen ? "Outfit vetoes" : "Rank her outfits"}
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : vetoes.length === 0 ? (
          <p className="rounded-xl border border-gold/15 bg-charcoal/60 px-4 py-8 text-center text-sm text-muted-foreground">
            {isQueen
              ? "No outfit vetoes yet."
              : "No open outfit vetoes. When Queen posts options, rank them here."}
          </p>
        ) : (
          <ul className="space-y-4">
            {vetoes.map((v) => {
              const order = rankOrders[v.id] ?? v.options.map((o) => o.id);
              const ordered = order
                .map((id) => v.options.find((o) => o.id === id))
                .filter(Boolean) as (JealousyOutfitOption & {
                signedUrl?: string;
              })[];
              const winner =
                v.winning_option_id &&
                v.options.find((o) => o.id === v.winning_option_id);

              return (
                <li
                  key={v.id}
                  id={`outfit-veto-${v.id}`}
                  className={cn(
                    "space-y-3 rounded-xl border bg-charcoal/80 p-4 sm:p-5",
                    v.id === focusVetoId
                      ? "border-gold/40"
                      : "border-gold/15"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] uppercase tracking-wider",
                        v.status === "open"
                          ? "border-gold/50 text-gold"
                          : "border-emerald-500/40 text-emerald-300"
                      )}
                    >
                      {v.status === "open" ? "Awaiting rank" : "Ranked"}
                    </Badge>
                    {(v.denial_days > 0 || v.edge_debt > 0) && (
                      <span className="text-xs text-muted-foreground">
                        Mission stakes:{" "}
                        {v.denial_days > 0 ? `+${v.denial_days}d` : ""}
                        {v.denial_days > 0 && v.edge_debt > 0 ? " · " : ""}
                        {v.edge_debt > 0 ? `+${v.edge_debt} edges` : ""}
                      </span>
                    )}
                  </div>

                  {v.status === "ranked" && winner && (
                    <p className="text-sm text-ivory/90">
                      Winner:{" "}
                      <span className="text-gold">
                        {winner.label || "Outfit #1 pick"}
                      </span>
                      {v.mission_id ? " — mission locked" : ""}
                    </p>
                  )}

                  <div className="grid gap-3 sm:grid-cols-3">
                    {(v.status === "open" && isSlave ? ordered : v.options).map(
                      (o, idx) => (
                        <div
                          key={o.id}
                          className="space-y-2 rounded-lg border border-gold/15 bg-void/40 p-2"
                        >
                          <div className="relative aspect-[3/4] overflow-hidden rounded-md bg-void">
                            {o.signedUrl ? (
                              <Image
                                src={o.signedUrl}
                                alt={o.label || "Outfit"}
                                fill
                                unoptimized
                                className="object-cover"
                                sizes="33vw"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                No preview
                              </div>
                            )}
                            {v.status === "open" && isSlave && (
                              <span className="absolute left-1.5 top-1.5 rounded bg-void/80 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gold">
                                #{idx + 1}
                                {idx === 0 ? " hurts most" : ""}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-ivory/80">
                            {o.label || `Outfit`}
                          </p>
                          {v.status === "open" && isSlave && (
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 flex-1 border-gold/25"
                                disabled={idx === 0}
                                onClick={() => moveRank(v.id, idx, -1)}
                              >
                                <ArrowUp className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 flex-1 border-gold/25"
                                disabled={idx === ordered.length - 1}
                                onClick={() => moveRank(v.id, idx, 1)}
                              >
                                <ArrowDown className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    )}
                  </div>

                  {v.status === "open" && isSlave && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Put the outfit that would hurt most at #1. Queen wears
                        that one.
                      </p>
                      <Button
                        type="button"
                        disabled={rankingId === v.id}
                        onClick={() => void submitRank(v)}
                        className="bg-gold text-void hover:bg-gold-muted"
                      >
                        {rankingId === v.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Lock ranking &amp; open mission
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

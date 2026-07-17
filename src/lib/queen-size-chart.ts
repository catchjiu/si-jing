import type { createClient } from "@/lib/supabase/client";
import type { QueenSizeChart, QueenSizeChartDraft } from "@/lib/types";

type Supabase = ReturnType<typeof createClient>;

export const SIZE_CHART_FIELDS: {
  key: keyof QueenSizeChartDraft;
  label: string;
  placeholder: string;
}[] = [
  { key: "height", label: "Height", placeholder: `5'6" / 168 cm` },
  { key: "bust", label: "Bust", placeholder: `34" / 86 cm` },
  { key: "waist", label: "Waist", placeholder: `26" / 66 cm` },
  { key: "hips", label: "Hips", placeholder: `36" / 91 cm` },
  { key: "dress_size", label: "Dress size", placeholder: "US 4 / S" },
  { key: "top_size", label: "Top / shirt", placeholder: "S / US 4" },
  { key: "bottom_size", label: "Bottom / pants", placeholder: "27 / US 4" },
  { key: "bra_size", label: "Bra", placeholder: "34C" },
  { key: "underwear_size", label: "Underwear", placeholder: "S / M" },
  { key: "shoe_size", label: "Shoes", placeholder: "US 7 / EU 37.5" },
  { key: "ring_size", label: "Ring", placeholder: "US 6" },
];

export function emptySizeChartDraft(): QueenSizeChartDraft {
  return {
    height: "",
    bust: "",
    waist: "",
    hips: "",
    dress_size: "",
    top_size: "",
    bottom_size: "",
    bra_size: "",
    underwear_size: "",
    shoe_size: "",
    ring_size: "",
    notes: "",
  };
}

export function chartToDraft(chart: QueenSizeChart | null): QueenSizeChartDraft {
  if (!chart) return emptySizeChartDraft();
  return {
    height: chart.height ?? "",
    bust: chart.bust ?? "",
    waist: chart.waist ?? "",
    hips: chart.hips ?? "",
    dress_size: chart.dress_size ?? "",
    top_size: chart.top_size ?? "",
    bottom_size: chart.bottom_size ?? "",
    bra_size: chart.bra_size ?? "",
    underwear_size: chart.underwear_size ?? "",
    shoe_size: chart.shoe_size ?? "",
    ring_size: chart.ring_size ?? "",
    notes: chart.notes ?? "",
  };
}

function trimOrNull(value: string): string | null {
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function draftToRow(userId: string, draft: QueenSizeChartDraft) {
  return {
    user_id: userId,
    height: trimOrNull(draft.height),
    bust: trimOrNull(draft.bust),
    waist: trimOrNull(draft.waist),
    hips: trimOrNull(draft.hips),
    dress_size: trimOrNull(draft.dress_size),
    top_size: trimOrNull(draft.top_size),
    bottom_size: trimOrNull(draft.bottom_size),
    bra_size: trimOrNull(draft.bra_size),
    underwear_size: trimOrNull(draft.underwear_size),
    shoe_size: trimOrNull(draft.shoe_size),
    ring_size: trimOrNull(draft.ring_size),
    notes: trimOrNull(draft.notes),
    updated_at: new Date().toISOString(),
  };
}

export function hasAnySizeChartValue(draft: QueenSizeChartDraft): boolean {
  return SIZE_CHART_FIELDS.some((f) => draft[f.key].trim().length > 0) ||
    draft.notes.trim().length > 0;
}

export function formatSizeChartForCopy(draft: QueenSizeChartDraft): string {
  const lines: string[] = [];
  for (const { key, label } of SIZE_CHART_FIELDS) {
    const value = draft[key].trim();
    if (value) lines.push(`${label}: ${value}`);
  }
  if (draft.notes.trim()) {
    lines.push(`Notes: ${draft.notes.trim()}`);
  }
  return lines.join("\n");
}

export async function fetchQueenSizeChart(
  supabase: Supabase,
  queenId: string
): Promise<QueenSizeChart | null> {
  const { data, error } = await supabase
    .from("queen_size_chart")
    .select("*")
    .eq("user_id", queenId)
    .maybeSingle();
  if (error) throw error;
  return (data as QueenSizeChart | null) ?? null;
}

export async function fetchPrimaryQueenId(
  supabase: Supabase
): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_queen_status");
  if (!error && data) {
    const row = (Array.isArray(data) ? data[0] : data) as
      | { queen_id?: string }
      | undefined;
    if (row?.queen_id) return row.queen_id;
  }

  const { data: queen } = await supabase
    .from("users")
    .select("id")
    .eq("role", "queen")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (queen?.id as string | undefined) ?? null;
}

export async function saveQueenSizeChart(
  supabase: Supabase,
  userId: string,
  draft: QueenSizeChartDraft
): Promise<QueenSizeChart> {
  const row = draftToRow(userId, draft);
  const { data, error } = await supabase
    .from("queen_size_chart")
    .upsert(row, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data as QueenSizeChart;
}

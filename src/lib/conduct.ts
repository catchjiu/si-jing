import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export const CONDUCT_SETTINGS_KEY = "conduct_level";

/** 0 = Bad boy (blur) … 4 = Good boy (clear) */
export type ConductLevel = 0 | 1 | 2 | 3 | 4;

export const CONDUCT_STEPS: {
  level: ConductLevel;
  label: string;
  hint: string;
}[] = [
  {
    level: 0,
    label: "Bad boy",
    hint: "All pictures are blurred until he earns better",
  },
  {
    level: 1,
    label: "Naughty",
    hint: "On thin ice — behave",
  },
  {
    level: 2,
    label: "Neutral",
    hint: "Neither praised nor punished",
  },
  {
    level: 3,
    label: "Pleasing",
    hint: "Doing well — keep it up",
  },
  {
    level: 4,
    label: "Good boy",
    hint: "In her good graces",
  },
];

export function normalizeConductLevel(raw: unknown): ConductLevel {
  const n = Number(
    typeof raw === "object" && raw != null && "level" in raw
      ? (raw as { level: unknown }).level
      : raw
  );
  if (!Number.isFinite(n)) return 4;
  const clamped = Math.min(4, Math.max(0, Math.round(n)));
  return clamped as ConductLevel;
}

export function conductMeta(level: ConductLevel) {
  return CONDUCT_STEPS.find((s) => s.level === level) ?? CONDUCT_STEPS[4]!;
}

/** Only Bad boy blurs every picture on the site. */
export function conductBlursMedia(level: ConductLevel): boolean {
  return level === 0;
}

export async function fetchConductLevel(
  supabase: Supabase
): Promise<ConductLevel> {
  const { data, error } = await supabase
    .from("pair_settings")
    .select("value")
    .eq("key", CONDUCT_SETTINGS_KEY)
    .maybeSingle();
  if (error) throw error;
  return normalizeConductLevel(data?.value);
}

export async function saveConductLevel(
  supabase: Supabase,
  level: ConductLevel,
  userId: string
): Promise<void> {
  const { error } = await supabase.from("pair_settings").upsert({
    key: CONDUCT_SETTINGS_KEY,
    value: { level },
    updated_at: new Date().toISOString(),
    updated_by: userId,
  });
  if (error) throw error;
}

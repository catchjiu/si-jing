import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export const QUEEN_CYCLE_KEY = "queen_cycle";

export type QueenCycleSettings = {
  last_period_start: string;
  cycle_length_days: number;
  period_length_days: number;
  remind_slave: boolean;
};

export type CyclePhase = "period" | "follicular" | "luteal" | "pms" | "unknown";

export type QueenCycleInfo = QueenCycleSettings & {
  day_in_cycle: number;
  days_until_next: number;
  next_period_start: string;
  is_on_period: boolean;
  phase: CyclePhase;
  phase_label: string;
  slave_hint: string;
};

const DEFAULTS: QueenCycleSettings = {
  last_period_start: "2026-07-17",
  cycle_length_days: 28,
  period_length_days: 7,
  remind_slave: true,
};

/** Canonical reset values for the period tracker. */
export function defaultQueenCycleSettings(): QueenCycleSettings {
  return { ...DEFAULTS };
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayYmd(timeZone = "America/Los_Angeles"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function daysBetween(startYmd: string, endYmd: string): number {
  const a = parseYmd(startYmd).getTime();
  const b = parseYmd(endYmd).getTime();
  return Math.floor((b - a) / (24 * 60 * 60 * 1000));
}

function addDays(ymd: string, days: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return formatYmd(d);
}

export function normalizeCycleSettings(
  raw: Record<string, unknown> | null | undefined
): QueenCycleSettings {
  const cycle = Number(raw?.cycle_length_days ?? DEFAULTS.cycle_length_days);
  const period = Number(raw?.period_length_days ?? DEFAULTS.period_length_days);
  return {
    last_period_start: String(
      raw?.last_period_start ?? DEFAULTS.last_period_start
    ),
    cycle_length_days: Math.min(45, Math.max(21, Math.floor(cycle) || 28)),
    period_length_days: Math.min(10, Math.max(2, Math.floor(period) || 7)),
    remind_slave: raw?.remind_slave !== false,
  };
}

export function computeCycleInfo(
  settings: QueenCycleSettings,
  asOfYmd = todayYmd()
): QueenCycleInfo {
  const start = settings.last_period_start;
  const cycleLen = settings.cycle_length_days;
  const periodLen = settings.period_length_days;

  let elapsed = daysBetween(start, asOfYmd);
  if (elapsed < 0) elapsed = 0;

  const dayInCycle = (elapsed % cycleLen) + 1;
  const cyclesCompleted = Math.floor(elapsed / cycleLen);
  const currentCycleStart = addDays(start, cyclesCompleted * cycleLen);
  const nextPeriodStart = addDays(currentCycleStart, cycleLen);
  const daysUntilNext = Math.max(0, daysBetween(asOfYmd, nextPeriodStart));
  const isOnPeriod = dayInCycle <= periodLen;

  let phase: CyclePhase = "unknown";
  let phaseLabel = "Cycle";
  let slaveHint = "Take care of your Queen.";

  if (isOnPeriod) {
    phase = "period";
    phaseLabel = `Period · day ${dayInCycle}`;
    slaveHint =
      "Be extra nice to your Queen — comfort, patience, and soft care.";
  } else if (dayInCycle > cycleLen - 3) {
    phase = "pms";
    phaseLabel = "PMS window";
    slaveHint =
      "She may need extra gentleness soon — stay attentive and kind.";
  } else if (dayInCycle <= Math.ceil(cycleLen / 2)) {
    phase = "follicular";
    phaseLabel = "Follicular";
    slaveHint = "Stay sweet and attentive.";
  } else {
    phase = "luteal";
    phaseLabel = "Luteal";
    slaveHint = "Keep checking in — her energy may dip.";
  }

  return {
    ...settings,
    day_in_cycle: dayInCycle,
    days_until_next: daysUntilNext,
    next_period_start: nextPeriodStart,
    is_on_period: isOnPeriod,
    phase,
    phase_label: phaseLabel,
    slave_hint: slaveHint,
  };
}

export async function loadQueenCycle(
  supabase: Supabase
): Promise<QueenCycleInfo> {
  const { data, error } = await supabase
    .from("pair_settings")
    .select("value")
    .eq("key", QUEEN_CYCLE_KEY)
    .maybeSingle();
  if (error) throw error;
  const settings = normalizeCycleSettings(
    (data?.value ?? {}) as Record<string, unknown>
  );
  return computeCycleInfo(settings);
}

export async function saveQueenCycle(
  supabase: Supabase,
  settings: QueenCycleSettings,
  updatedBy: string
): Promise<QueenCycleInfo> {
  const normalized = normalizeCycleSettings(settings);
  const { error } = await supabase.from("pair_settings").upsert({
    key: QUEEN_CYCLE_KEY,
    value: normalized,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return computeCycleInfo(normalized);
}

export function todayCycleDate(): string {
  return todayYmd();
}

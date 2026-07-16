import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

/** 0 = Monday … 6 = Sunday (ISO). */
export type WorkDayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const WORK_DAY_LABELS: { index: WorkDayIndex; label: string; short: string }[] =
  [
    { index: 0, label: "Monday", short: "Mon" },
    { index: 1, label: "Tuesday", short: "Tue" },
    { index: 2, label: "Wednesday", short: "Wed" },
    { index: 3, label: "Thursday", short: "Thu" },
    { index: 4, label: "Friday", short: "Fri" },
    { index: 5, label: "Saturday", short: "Sat" },
    { index: 6, label: "Sunday", short: "Sun" },
  ];

export type QueenWorkDayDraft = {
  dayOfWeek: WorkDayIndex;
  enabled: boolean;
  startTime: string; // HH:MM
  endTime: string;
};

export type QueenWorkScheduleRow = {
  id: string;
  user_id: string;
  week_start: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  enabled: boolean;
  timezone: string;
};

/** Monday (YYYY-MM-DD) of the week containing `date` in `timeZone`. */
export function mondayOfWeek(
  date: Date = new Date(),
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  if (!year || !month || !day || !weekday) {
    throw new Error("Could not resolve local date");
  }

  const asUtc = new Date(`${year}-${month}-${day}T12:00:00Z`);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const dow = map[weekday] ?? 0;
  asUtc.setUTCDate(asUtc.getUTCDate() - dow);
  return asUtc.toISOString().slice(0, 10);
}

export function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T12:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export function emptyWeekDraft(): QueenWorkDayDraft[] {
  return WORK_DAY_LABELS.map(({ index }) => ({
    dayOfWeek: index,
    enabled: index <= 4,
    startTime: "09:00",
    endTime: "17:00",
  }));
}

function normalizeTime(value: string): string {
  // Supabase TIME may come back as HH:MM:SS
  const m = value.match(/^(\d{2}):(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : value.slice(0, 5);
}

export function rowsToDraft(rows: QueenWorkScheduleRow[]): QueenWorkDayDraft[] {
  const byDay = new Map(rows.map((r) => [r.day_of_week, r]));
  return WORK_DAY_LABELS.map(({ index }) => {
    const row = byDay.get(index);
    if (!row) {
      return {
        dayOfWeek: index,
        enabled: false,
        startTime: "09:00",
        endTime: "17:00",
      };
    }
    return {
      dayOfWeek: index,
      enabled: row.enabled,
      startTime: normalizeTime(row.start_time),
      endTime: normalizeTime(row.end_time),
    };
  });
}

export async function fetchWeekSchedule(
  supabase: Supabase,
  userId: string,
  weekStart: string
): Promise<QueenWorkScheduleRow[]> {
  const { data, error } = await supabase
    .from("queen_work_schedule")
    .select("*")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .order("day_of_week", { ascending: true });
  if (error) throw error;
  return (data as QueenWorkScheduleRow[]) ?? [];
}

export async function saveWeekSchedule(
  supabase: Supabase,
  opts: {
    userId: string;
    weekStart: string;
    timezone: string;
    days: QueenWorkDayDraft[];
  }
): Promise<void> {
  const { userId, weekStart, timezone, days } = opts;

  // Replace the week atomically: delete then insert enabled/configured days
  const { error: delError } = await supabase
    .from("queen_work_schedule")
    .delete()
    .eq("user_id", userId)
    .eq("week_start", weekStart);
  if (delError) throw delError;

  const rows = days
    .filter((d) => d.enabled)
    .map((d) => ({
      user_id: userId,
      week_start: weekStart,
      day_of_week: d.dayOfWeek,
      start_time: d.startTime,
      end_time: d.endTime,
      enabled: true,
      timezone,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) return;

  const { error: insError } = await supabase
    .from("queen_work_schedule")
    .insert(rows);
  if (insError) throw insError;
}

export async function applyQueenWorkSchedules(
  supabase: Supabase
): Promise<number> {
  const { data, error } = await supabase.rpc("apply_queen_work_schedules");
  if (error) throw error;
  return Number(data ?? 0);
}

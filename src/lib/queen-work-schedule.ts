import type { createClient } from "@/lib/supabase/client";
import {
  QUEEN_PLACE,
  QUEEN_WORK_TIMEZONE,
  SLAVE_PLACE,
} from "@/lib/partner-locations";
import {
  formatWallTimeAcrossZones,
  hmInZone,
  weekdayShortInZone,
  ymdInZone,
} from "@/lib/timezone";

type Supabase = ReturnType<typeof createClient>;

export { QUEEN_WORK_TIMEZONE };

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

export function shiftWeek(weekStart: string, deltaWeeks: number): string {
  const d = new Date(`${weekStart}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaWeeks * 7);
  return d.toISOString().slice(0, 10);
}

export function dateYmdForWeekDay(
  weekStart: string,
  dayOfWeek: number
): string {
  const d = new Date(`${weekStart}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayOfWeek);
  return d.toISOString().slice(0, 10);
}

/** Format a work-day wall time in the slave's timezone (Taipei). */
export function formatWorkDayInSlaveZone(
  weekStart: string,
  dayOfWeek: number,
  hm: string
): string {
  const ymd = dateYmdForWeekDay(weekStart, dayOfWeek);
  try {
    return formatWallTimeAcrossZones(
      ymd,
      hm,
      QUEEN_WORK_TIMEZONE,
      SLAVE_PLACE.timeZone,
      { includeZone: true, zoneLabel: SLAVE_PLACE.zoneShort }
    );
  } catch {
    return "";
  }
}

/** Format a work-day wall time in the queen's timezone (Pacific). */
export function formatWorkDayInQueenZone(
  weekStart: string,
  dayOfWeek: number,
  hm: string
): string {
  const ymd = dateYmdForWeekDay(weekStart, dayOfWeek);
  try {
    return formatWallTimeAcrossZones(
      ymd,
      hm,
      QUEEN_WORK_TIMEZONE,
      QUEEN_PLACE.timeZone,
      { includeZone: true, zoneLabel: QUEEN_PLACE.zoneShort }
    );
  } catch {
    return hm;
  }
}

export function isCurrentlyInWorkWindow(
  day: QueenWorkDayDraft,
  weekStart: string
): boolean {
  if (!day.enabled) return false;
  const now = new Date();
  const thisMonday = mondayOfWeek(now, QUEEN_WORK_TIMEZONE);
  if (weekStart !== thisMonday) return false;
  const weekday = weekdayShortInZone(now, QUEEN_WORK_TIMEZONE);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  if (map[weekday] !== day.dayOfWeek) return false;
  const nowHm = hmInZone(now, QUEEN_WORK_TIMEZONE);
  return nowHm >= day.startTime && nowHm < day.endTime;
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

export type WorkingUntilInfo = {
  until: string;
  /** Queen / Pacific label, e.g. "5:00 PM PT" */
  labelPacific: string;
  /** Slave / Taipei label, e.g. "Sat 8:00 AM Taipei" */
  labelTaipei: string;
  /** Default for slave dashboard: Taipei primary. */
  label: string;
};

/**
 * End time of today's work window for Queen, if currently inside it.
 * Window is evaluated in California time; labels include Taipei for D.
 */
export async function fetchQueenWorkingUntil(
  supabase: Supabase,
  queenId: string
): Promise<WorkingUntilInfo | null> {
  const scheduleTz = QUEEN_WORK_TIMEZONE;
  const now = new Date();
  const weekStart = mondayOfWeek(now, scheduleTz);
  const weekday = weekdayShortInZone(now, scheduleTz);
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

  const { data, error } = await supabase
    .from("queen_work_schedule")
    .select("start_time, end_time, enabled, timezone")
    .eq("user_id", queenId)
    .eq("week_start", weekStart)
    .eq("day_of_week", dow)
    .eq("enabled", true)
    .maybeSingle();

  if (error || !data) return null;

  const rowTz = (data.timezone as string | null) || scheduleTz;
  const start = String(data.start_time).slice(0, 5);
  const end = String(data.end_time).slice(0, 5);

  // Evaluate "now" in the row's timezone (should be Pacific)
  const nowInRow = hmInZone(now, rowTz);
  if (nowInRow < start || nowInRow >= end) return null;

  const todayInRow = ymdInZone(now, rowTz);
  const labelPacific = formatWallTimeAcrossZones(
    todayInRow,
    end,
    rowTz,
    QUEEN_PLACE.timeZone,
    { includeZone: true, zoneLabel: QUEEN_PLACE.zoneShort }
  );
  const labelTaipei = formatWallTimeAcrossZones(
    todayInRow,
    end,
    rowTz,
    SLAVE_PLACE.timeZone,
    { includeZone: true, zoneLabel: SLAVE_PLACE.zoneShort }
  );

  return {
    until: end,
    labelPacific,
    labelTaipei,
    label: `${labelTaipei} (${labelPacific})`,
  };
}

/**
 * Convert a wall-clock date+time in `timeZone` to a UTC Date.
 * Iteratively corrects for DST / offset using Intl.
 */
export function zonedWallTimeToUtc(
  dateYmd: string,
  hm: string,
  timeZone: string
): Date {
  const [y, mo, d] = dateYmd.split("-").map(Number);
  const [h, mi] = hm.split(":").map(Number);
  if (
    [y, mo, d, h, mi].some((n) => Number.isNaN(n)) ||
    y == null ||
    mo == null ||
    d == null ||
    h == null ||
    mi == null
  ) {
    throw new Error("Invalid date or time");
  }

  let utcMs = Date.UTC(y, mo - 1, d, h, mi, 0);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(utcMs))
        .filter((p) => p.type !== "literal")
        .map((p) => [p.type, p.value])
    ) as Record<string, string>;

    const asY = Number(parts.year);
    const asMo = Number(parts.month);
    const asD = Number(parts.day);
    let asH = Number(parts.hour);
    const asMi = Number(parts.minute);
    // Some engines report midnight as 24
    if (asH === 24) asH = 0;

    const asUtc = Date.UTC(asY, asMo - 1, asD, asH, asMi, 0);
    const desired = Date.UTC(y, mo - 1, d, h, mi, 0);
    utcMs += desired - asUtc;
  }

  return new Date(utcMs);
}

/** Today's YYYY-MM-DD in a given IANA zone. */
export function ymdInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** HH:MM (24h) in a given IANA zone. */
export function hmInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  let hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  if (hour === "24") hour = "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

export function weekdayShortInZone(date: Date, timeZone: string): string {
  return (
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
    })
      .formatToParts(date)
      .find((p) => p.type === "weekday")?.value ?? "Mon"
  );
}

/** Format a wall time from fromTz into toTz (includes weekday if the calendar day differs). */
export function formatWallTimeAcrossZones(
  dateYmdInFrom: string,
  hm: string,
  fromTz: string,
  toTz: string,
  opts?: { includeZone?: boolean; zoneLabel?: string }
): string {
  const utc = zonedWallTimeToUtc(dateYmdInFrom, hm, fromTz);
  const fromDay = dateYmdInFrom;
  const toDay = ymdInZone(utc, toTz);
  const time = new Intl.DateTimeFormat(undefined, {
    timeZone: toTz,
    hour: "numeric",
    minute: "2-digit",
  }).format(utc);

  const weekday =
    fromDay === toDay
      ? null
      : new Intl.DateTimeFormat(undefined, {
          timeZone: toTz,
          weekday: "short",
        }).format(utc);

  const zone =
    opts?.includeZone && opts.zoneLabel ? ` ${opts.zoneLabel}` : "";
  return weekday ? `${weekday} ${time}${zone}` : `${time}${zone}`;
}

export function formatClockInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatDateLineInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
}

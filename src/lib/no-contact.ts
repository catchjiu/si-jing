import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export const NO_CONTACT_DURATION_PRESETS = [
  { label: "15 minutes", minutes: 15 },
  { label: "30 minutes", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 2 * 60 },
  { label: "6 hours", minutes: 6 * 60 },
  { label: "12 hours", minutes: 12 * 60 },
  { label: "24 hours", minutes: 24 * 60 },
  { label: "3 days", minutes: 3 * 24 * 60 },
  { label: "1 week", minutes: 7 * 24 * 60 },
  { label: "Custom", minutes: -1 },
  { label: "Until I lift it", minutes: 0 },
] as const;

export async function fetchNoContactActive(
  supabase: Supabase
): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_no_contact_active");
  if (error) {
    console.error("is_no_contact_active", error);
    return false;
  }
  return Boolean(data);
}

export async function clearExpiredNoContact(
  supabase: Supabase
): Promise<number> {
  const { data, error } = await supabase.rpc("clear_expired_no_contact");
  if (error) {
    console.error("clear_expired_no_contact", error);
    return 0;
  }
  return Number(data ?? 0);
}

export function resolveNoContactMinutes(opts: {
  preset: string;
  customDays: string;
  customHours: string;
  customMinutes: string;
}): number | null {
  if (opts.preset === "indefinite" || opts.preset === "0") return null;
  if (opts.preset === "custom") {
    const days = Math.max(0, parseInt(opts.customDays || "0", 10) || 0);
    const hours = Math.max(0, parseInt(opts.customHours || "0", 10) || 0);
    const minutes = Math.max(0, parseInt(opts.customMinutes || "0", 10) || 0);
    const total = days * 24 * 60 + hours * 60 + minutes;
    return total > 0 ? total : null;
  }
  const n = parseInt(opts.preset, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function formatNoContactDuration(minutes: number | null): string {
  if (minutes == null) return "until she lifts it";
  if (minutes < 60) return `for ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24 && mins === 0) {
    return `for ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (hours < 24) {
    return `for ${hours}h ${mins}m`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (remHours === 0 && mins === 0) {
    return `for ${days} day${days === 1 ? "" : "s"}`;
  }
  return `for ${days}d ${remHours}h`;
}

export function noContactEndsAtIso(minutes: number | null): string | null {
  if (minutes == null) return null;
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

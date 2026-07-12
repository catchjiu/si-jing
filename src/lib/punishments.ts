import { createClient } from "@/lib/supabase/client";
import type { Punishment, PunishmentType } from "@/lib/types";

export type PunishmentEffect =
  | "contact"
  | "rewards"
  | "tease_reveal"
  | "date_post";

export const PUNISHMENT_TYPE_LABELS: Record<PunishmentType, string> = {
  contact_restriction: "Contact restriction",
  custom: "Custom",
  task_debt: "Task debt",
  date_timeout: "Date timeout",
  orgasm_ban: "Orgasm / edge ban",
  privilege_freeze: "Privilege freeze",
};

export function isPunishmentActive(p: Punishment, now = new Date()): boolean {
  if (p.status !== "active") return false;
  if (p.clearance_mode === "task_debt") return true;
  return new Date(p.ends_at) > now;
}

export function tasksRequired(p: Punishment): number {
  const n = Number(p.config?.tasks_required ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function hasPunishmentEffect(
  effect: PunishmentEffect,
  userId?: string
): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("has_punishment_effect", {
    p_user: userId,
    p_effect: effect,
  });
  if (error) {
    console.error("has_punishment_effect", error);
    return false;
  }
  return Boolean(data);
}

export async function hasActivePunishment(
  type?: PunishmentType,
  userId?: string
): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("has_active_punishment", {
    p_user: userId,
    p_type: type ?? null,
  });
  if (error) {
    console.error("has_active_punishment", error);
    return false;
  }
  return Boolean(data);
}

export async function fetchActiveEffects(userId?: string): Promise<{
  contact: boolean;
  rewards: boolean;
  tease_reveal: boolean;
  date_post: boolean;
}> {
  const [contact, rewards, tease_reveal, date_post] = await Promise.all([
    hasPunishmentEffect("contact", userId),
    hasPunishmentEffect("rewards", userId),
    hasPunishmentEffect("tease_reveal", userId),
    hasPunishmentEffect("date_post", userId),
  ]);
  return { contact, rewards, tease_reveal, date_post };
}

export function bannerCopy(p: Punishment): { headline: string; body: string } {
  switch (p.punishment_type) {
    case "contact_restriction":
      return {
        headline: p.title || "Contact Restricted",
        body: "You may not initiate contact with Queen Sisi until this timer ends.",
      };
    case "date_timeout":
      return {
        headline: p.title || "Date Timeout",
        body: "You may view the Dates timeline but cannot post until this ends.",
      };
    case "orgasm_ban":
      return {
        headline: p.title || "Orgasm / Edge Ban",
        body: "Honor system — acknowledge and obey until the timer ends.",
      };
    case "privilege_freeze":
      return {
        headline: p.title || "Privilege Freeze",
        body: "Requests are blocked, new rewards are hidden, and tease reveals are frozen.",
      };
    case "task_debt":
      return {
        headline: p.title || "Task Debt",
        body: "Clear this by completing the assigned debt tasks for Queen's approval.",
      };
    default:
      return {
        headline: p.title || "Punishment",
        body: p.reason || "An active consequence is in effect.",
      };
  }
}

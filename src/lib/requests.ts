export function desireLabel(level: number): string {
  if (level >= 90) return "Desperate";
  if (level >= 75) return "Aching";
  if (level >= 55) return "Eager";
  if (level >= 35) return "Hopeful";
  if (level >= 15) return "Curious";
  return "Quiet";
}

export function desireColor(level: number): string {
  if (level >= 75) return "text-red-300";
  if (level >= 45) return "text-gold";
  return "text-ivory/70";
}

export const REQUEST_TYPE_LABELS = {
  contact: "Contact",
  mercy: "Mercy",
  reward: "Reward",
  general: "General",
  orgasm: "Orgasm permission",
  directive: "Directive",
  question: "Question",
} as const;

export const PETITION_TYPES = [
  "contact",
  "mercy",
  "reward",
  "general",
  "orgasm",
] as const;

export const DIRECTIVE_TYPES = ["directive", "question"] as const;

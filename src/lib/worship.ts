export function loveLabel(level: number): string {
  if (level >= 90) return "Devoted";
  if (level >= 75) return "Adoring";
  if (level >= 55) return "Reverent";
  if (level >= 35) return "Grateful";
  if (level >= 15) return "Tender";
  return "Quiet";
}

export function loveColor(level: number): string {
  if (level >= 75) return "text-red-300";
  if (level >= 45) return "text-gold";
  return "text-ivory/70";
}

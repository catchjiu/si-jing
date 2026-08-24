export function localDateInputValue(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatFartDate(value: string | null | undefined): string {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function loudnessLabel(level: number): string {
  if (level >= 90) return "Seismic";
  if (level >= 75) return "Thunderous";
  if (level >= 55) return "Loud";
  if (level >= 35) return "Solid";
  if (level >= 15) return "Soft";
  return "Whisper";
}

export function hotnessLabel(level: number): string {
  if (level >= 90) return "Unholy";
  if (level >= 75) return "Filthy";
  if (level >= 55) return "Hot";
  if (level >= 35) return "Tasty";
  if (level >= 15) return "Cute";
  return "Mild";
}

import type { UserRole } from "@/lib/types";

/**
 * Role speech orthography for Queen Sisi.
 *
 * Queen: self capitalized (I, Me, Queen); slave refs lowercase (you, slave)
 * Slave: self lowered (i, me) except role title Slave; Queen refs capitalized (You, Queen)
 */
export function formatRoleSpeech(
  text: string,
  role: UserRole | null | undefined
): string {
  if (!text || !role) return text;

  if (role === "queen") {
    return applyReplacements(text, [
      // Contractionsions first
      [/\bi'm\b/gi, "I'm"],
      [/\bi'll\b/gi, "I'll"],
      [/\bi've\b/gi, "I've"],
      [/\bi'd\b/gi, "I'd"],
      [/\bi\b/g, "I"],
      [/\bme\b/gi, "Me"],
      [/\bqueen\b/gi, "Queen"],
      // Force lowercase when referring to him
      [/\byou\b/gi, "you"],
      [/\bslave\b/gi, "slave"],
    ]);
  }

  // slave
  return applyReplacements(text, [
    [/\bi'm\b/gi, "i'm"],
    [/\bi'll\b/gi, "i'll"],
    [/\bi've\b/gi, "i've"],
    [/\bi'd\b/gi, "i'd"],
    [/\bi\b/gi, "i"],
    [/\bme\b/gi, "me"],
    [/\bslave\b/gi, "Slave"],
    [/\byou\b/gi, "You"],
    [/\bqueen\b/gi, "Queen"],
  ]);
}

function applyReplacements(
  text: string,
  rules: [RegExp, string][]
): string {
  let out = text;
  for (const [pattern, replacement] of rules) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

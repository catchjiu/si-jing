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

/** Apply role speech only to text nodes; leave HTML tags untouched. */
export function formatRoleSpeechHtml(
  html: string,
  role: UserRole | null | undefined
): string {
  if (!html || !role) return html;
  return html.replace(/(<[^>]+>)|([^<]+)/g, (match, tag: string, text: string) => {
    if (tag) return tag;
    return formatRoleSpeech(text, role);
  });
}

/** Short instruction block for AI rewrites so they match site orthography. */
export function roleSpeechAiInstructions(
  role: UserRole | null | undefined
): string {
  if (role === "queen") {
    return [
      "Role-speech orthography (required):",
      "Write as Queen. Capitalize self-references: I, Me, I'm, I'll, I've, I'd, Queen.",
      "Lowercase when referring to the slave: you, slave.",
    ].join(" ");
  }
  if (role === "slave") {
    return [
      "Role-speech orthography (required):",
      "Write as the slave. Lowercase self-references: i, me, i'm, i'll, i've, i'd — except capitalize the role title Slave.",
      "Capitalize Queen references: You, Queen, You're, You'll, You've, You'd.",
    ].join(" ");
  }
  return "";
}

/**
 * Dialogue layout for dual-voice Listen (Fish Audio).
 * Spoken lines must be labeled so TTS can assign Queen vs slave voices.
 */
export function dialogueFormatAiInstructions(): string {
  return [
    "Dialogue format for dual-voice audio (required):",
    "Put EVERY spoken line in its own <p> that starts with exactly Queen: or Slave: (who is speaking), then the spoken words.",
    'Example: <p>Queen: Kneel.</p><p>Slave: Yes, Queen.</p>',
    "Narration stays in separate unlabeled <p> tags with NO quotation marks and NO spoken dialogue mixed in.",
    "Do not use she said / he said / i said attribution. Do not put both speakers in one paragraph.",
    "Do not write dialogue only inside curly/straight quotes inside narration — always use the Queen:/Slave: line form instead.",
  ].join(" ");
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

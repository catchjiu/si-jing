import type { UserRole } from "@/lib/types";
import type { RoleDisplayTitle } from "@/lib/role-display";

function isDaddyTitle(dominantTitle: RoleDisplayTitle): boolean {
  return dominantTitle === "Daddy" || dominantTitle === "slut";
}

function dominantWord(dominantTitle: RoleDisplayTitle): "Queen" | "Daddy" {
  return isDaddyTitle(dominantTitle) ? "Daddy" : "Queen";
}

function submissiveWord(dominantTitle: RoleDisplayTitle): "slave" | "slut" {
  return isDaddyTitle(dominantTitle) ? "slut" : "slave";
}

/**
 * Role speech orthography for Queen Sisi.
 *
 * Dominant (Queen/Daddy): self capitalized (I, Me, title); submissive refs lowercase
 * Submissive: self lowered (i, me) except home role title Slave; dominant refs capitalized
 */
export function formatRoleSpeech(
  text: string,
  role: UserRole | null | undefined,
  dominantTitle: RoleDisplayTitle = "Queen"
): string {
  if (!text || !role) return text;

  const title = dominantWord(dominantTitle);
  const sub = submissiveWord(dominantTitle);
  const titlePattern = isDaddyTitle(dominantTitle)
    ? /\b(daddy|king|queen)\b/gi
    : /\b(queen|daddy|king)\b/gi;
  const subPattern = isDaddyTitle(dominantTitle)
    ? /\b(slut|slave)\b/gi
    : /\b(slave|slut)\b/gi;

  if (role === "queen") {
    return applyReplacements(text, [
      [/\bi'm\b/gi, "I'm"],
      [/\bi'll\b/gi, "I'll"],
      [/\bi've\b/gi, "I've"],
      [/\bi'd\b/gi, "I'd"],
      [/\bi\b/g, "I"],
      [/\bme\b/gi, "Me"],
      [titlePattern, title],
      [/\byou\b/gi, "you"],
      [subPattern, sub],
    ]);
  }

  const selfTitle = sub === "slave" ? "Slave" : "slut";

  return applyReplacements(text, [
    [/\bi'm\b/gi, "i'm"],
    [/\bi'll\b/gi, "i'll"],
    [/\bi've\b/gi, "i've"],
    [/\bi'd\b/gi, "i'd"],
    [/\bi\b/gi, "i"],
    [/\bme\b/gi, "me"],
    [subPattern, selfTitle],
    [/\byou\b/gi, "You"],
    [titlePattern, title],
  ]);
}

/** Apply role speech only to text nodes; leave HTML tags untouched. */
export function formatRoleSpeechHtml(
  html: string,
  role: UserRole | null | undefined,
  dominantTitle: RoleDisplayTitle = "Queen"
): string {
  if (!html || !role) return html;
  return html.replace(/(<[^>]+>)|([^<]+)/g, (match, tag: string, text: string) => {
    if (tag) return tag;
    return formatRoleSpeech(text, role, dominantTitle);
  });
}

/** Short instruction block for AI rewrites so they match site orthography. */
export function roleSpeechAiInstructions(
  role: UserRole | null | undefined,
  dominantTitle: RoleDisplayTitle = "Queen"
): string {
  const title = dominantWord(dominantTitle);
  const sub = submissiveWord(dominantTitle);
  if (role === "queen") {
    return [
      "Role-speech orthography (required):",
      `Write as ${title}. Capitalize self-references: I, Me, I'm, I'll, I've, I'd, ${title}.`,
      `Lowercase when referring to the ${sub}: you, ${sub}.`,
    ].join(" ");
  }
  if (role === "slave") {
    const self = sub === "slave" ? "Slave" : "slut";
    return [
      "Role-speech orthography (required):",
      `Write as the ${sub}. Lowercase self-references: i, me, i'm, i'll, i've, i'd${
        sub === "slave" ? ` — except capitalize the role title ${self}.` : "."
      }`,
      `Capitalize ${title} references: You, ${title}, You're, You'll, You've, You'd.`,
    ].join(" ");
  }
  return "";
}

/**
 * Dialogue layout for the Fish Audio listen script only (not the reading HTML).
 */
export function listenScriptAiInstructions(
  dominantTitle: RoleDisplayTitle = "Queen"
): string {
  const title = dominantWord(dominantTitle);
  const speaker = submissiveWord(dominantTitle) === "slut" ? "slut" : "Slave";
  return [
    "Listen script rules (plain text after a LISTEN: marker — not HTML):",
    "Narration is unlabeled sentences/paragraphs.",
    `Every spoken line is its own line starting with exactly ${title}: or ${speaker}: then the spoken words.`,
    "Example:",
    "i waited by the door.",
    `${title}: Kneel.`,
    `${speaker}: Yes, ${title}.`,
    "No quotation marks. No she said / he said. Same story content as the reading version.",
  ].join("\n");
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

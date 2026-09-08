import type { UserRole } from "@/lib/types";
import type { RoleDisplayTitle } from "@/lib/role-display";

/**
 * Role speech orthography for Queen Sisi.
 *
 * Dominant (Queen/King): self capitalized (I, Me, title); slave refs lowercase
 * Slave: self lowered (i, me) except role title Slave; dominant refs capitalized
 */
export function formatRoleSpeech(
  text: string,
  role: UserRole | null | undefined,
  dominantTitle: RoleDisplayTitle = "Queen"
): string {
  if (!text || !role) return text;

  const title = dominantTitle === "King" ? "King" : "Queen";
  const titlePattern = dominantTitle === "King" ? /\bking\b/gi : /\bqueen\b/gi;

  if (role === "queen") {
    return applyReplacements(text, [
      // Contractionsions first
      [/\bi'm\b/gi, "I'm"],
      [/\bi'll\b/gi, "I'll"],
      [/\bi've\b/gi, "I've"],
      [/\bi'd\b/gi, "I'd"],
      [/\bi\b/g, "I"],
      [/\bme\b/gi, "Me"],
      [titlePattern, title],
      // Force lowercase when referring to him/her as slave
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
    [titlePattern, title],
    // Still normalize the unused dominant word if present
    [dominantTitle === "King" ? /\bqueen\b/gi : /\bking\b/gi, title],
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
  const title = dominantTitle === "King" ? "King" : "Queen";
  if (role === "queen") {
    return [
      "Role-speech orthography (required):",
      `Write as ${title}. Capitalize self-references: I, Me, I'm, I'll, I've, I'd, ${title}.`,
      "Lowercase when referring to the slave: you, slave.",
    ].join(" ");
  }
  if (role === "slave") {
    return [
      "Role-speech orthography (required):",
      "Write as the slave. Lowercase self-references: i, me, i'm, i'll, i've, i'd — except capitalize the role title Slave.",
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
  const title = dominantTitle === "King" ? "King" : "Queen";
  return [
    "Listen script rules (plain text after a LISTEN: marker — not HTML):",
    "Narration is unlabeled sentences/paragraphs.",
    `Every spoken line is its own line starting with exactly ${title}: or Slave: then the spoken words.`,
    "Example:",
    "i waited by the door.",
    `${title}: Kneel.`,
    `Slave: Yes, ${title}.`,
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

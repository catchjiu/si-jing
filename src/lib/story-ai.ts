import Anthropic from "@anthropic-ai/sdk";
import { sanitizeStoryHtml } from "@/lib/sanitize-html";
import {
  formatRoleSpeechHtml,
  listenScriptAiInstructions,
  roleSpeechAiInstructions,
} from "@/lib/role-speech";
import type { UserRole } from "@/lib/types";

export type StoryAiProvider = "claude" | "grok";

export const MAX_STORY_HTML_CHARS = 40_000;
export const MAX_STORY_PROMPT_CHARS = 4_000;
export const MAX_STORY_DIRECTION_CHARS = 2_000;
export const MAX_STORY_LISTEN_SCRIPT_CHARS = 20_000;

export function parseStoryAiProvider(raw: unknown): StoryAiProvider {
  return typeof raw === "string" && raw.toLowerCase() === "grok"
    ? "grok"
    : "claude";
}

export function storyHtmlOutputRules(): string {
  return [
    "Return ONLY valid HTML using these tags when needed: p, br, strong, em, u, s, blockquote, ul, ol, li, h2, h3, hr.",
    "Do not wrap the response in markdown fences.",
    "Do not include commentary before or after the HTML.",
    "Keep adult content if present; do not refuse solely for erotic themes between consenting adults.",
  ].join(" ");
}

export function cleanModelHtml(raw: string, role: UserRole): string {
  return formatRoleSpeechHtml(
    sanitizeStoryHtml(
      raw
        .replace(/^```(?:html)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim()
    ),
    role
  );
}

function cleanListenScript(raw: string): string {
  return raw
    .replace(/^```(?:text|plain|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_STORY_LISTEN_SCRIPT_CHARS);
}

/** Parse `TITLE` + reading HTML (+ optional `LISTEN` script) from a model response. */
export function parseGeneratedStory(
  raw: string,
  role: UserRole
): { title: string; html: string; listenScript: string } {
  const stripped = raw
    .replace(/^```(?:html|json|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let title = "";
  let rest = stripped;

  const titled = rest.match(/^TITLE:\s*(.+?)\s*(?:\n+)([\s\S]+)$/i);
  if (titled) {
    title = titled[1]
      .trim()
      .replace(/^["“”']+|["“”']+$/g, "")
      .slice(0, 160);
    rest = titled[2].trim();
  }

  let readingRaw = rest;
  let listenRaw = "";

  const listenSplit = rest.split(/\n\s*LISTEN:\s*\n/i);
  if (listenSplit.length >= 2) {
    readingRaw = listenSplit[0].trim();
    listenRaw = listenSplit.slice(1).join("\nLISTEN:\n").trim();
  }

  readingRaw = readingRaw.replace(/^\s*READING:\s*/i, "").trim();

  const heading = !title
    ? cleanModelHtml(readingRaw, role).match(/<h[23]>([\s\S]*?)<\/h[23]>/i)
    : null;
  if (!title && heading) {
    title = heading[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  }

  let html = cleanModelHtml(readingRaw, role);
  if (heading && html.includes(heading[0])) {
    html = html.replace(heading[0], "").trim() || html;
  }

  return {
    title,
    html,
    listenScript: cleanListenScript(listenRaw),
  };
}

export async function completeStoryModel(opts: {
  provider: StoryAiProvider;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const maxTokens = opts.maxTokens ?? 8192;
  const temperature = opts.temperature ?? 0.7;

  if (opts.provider === "grok") {
    return completeWithGrok({
      system: opts.system,
      user: opts.user,
      maxTokens,
      temperature,
    });
  }
  return completeWithClaude({
    system: opts.system,
    user: opts.user,
    maxTokens,
  });
}

async function completeWithClaude(opts: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("ANTHROPIC_API_KEY is not configured"), {
      status: 503,
    });
  }
  const model =
    process.env.ANTHROPIC_STORY_MODEL?.trim() || "claude-sonnet-4-6";
  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
}

async function completeWithGrok(opts: {
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
}): Promise<string> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("XAI_API_KEY is not configured"), {
      status: 503,
    });
  }
  const model = process.env.XAI_STORY_MODEL?.trim() || "grok-4.5";
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    const msg = data.error?.message || `Grok request failed (${res.status})`;
    throw Object.assign(new Error(msg), { status: 502, model });
  }

  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

/** Build / refresh a Fish-ready listen script from reading HTML. */
export async function generateListenScriptFromReading(opts: {
  provider?: StoryAiProvider;
  title: string;
  html: string;
  authorRole: UserRole;
}): Promise<string> {
  const provider = opts.provider ?? "claude";
  const raw = await completeStoryModel({
    provider,
    maxTokens: 8192,
    temperature: 0.3,
    system: [
      "You convert a story's reading HTML into a dual-voice listen script for Fish Audio TTS.",
      "Output ONLY the listen script plain text. No TITLE, no READING, no LISTEN marker, no HTML, no commentary.",
      roleSpeechAiInstructions(opts.authorRole),
      listenScriptAiInstructions(),
    ]
      .filter(Boolean)
      .join("\n"),
    user: [
      opts.title ? `Story title: ${opts.title}` : "",
      "Reading HTML:",
      opts.html.slice(0, MAX_STORY_HTML_CHARS),
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  const script = cleanListenScript(raw.replace(/^\s*LISTEN:\s*/i, ""));
  if (!script) {
    throw Object.assign(new Error("Model returned empty listen script"), {
      status: 502,
    });
  }
  return script;
}

export function storyAiFailurePayload(
  err: unknown,
  provider: StoryAiProvider
): { status: number; error: string } {
  const status =
    typeof err === "object" && err && "status" in err
      ? Number((err as { status?: number }).status) || 502
      : 502;
  let message = err instanceof Error ? err.message : "AI request failed";

  try {
    const raw =
      typeof err === "object" && err && "error" in err
        ? (
            err as {
              error?: { error?: { message?: string }; message?: string };
            }
          ).error
        : null;
    const apiMsg = raw?.error?.message || raw?.message;
    if (apiMsg) message = apiMsg;
  } catch {
    // keep original
  }

  if (/not_found|model/i.test(message)) {
    message =
      provider === "grok"
        ? "Grok model unavailable. Check XAI_API_KEY or set XAI_STORY_MODEL=grok-4.5"
        : "Claude model unavailable. Check ANTHROPIC_API_KEY or set ANTHROPIC_STORY_MODEL";
  }

  return { status, error: message };
}

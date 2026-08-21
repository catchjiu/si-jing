import Anthropic from "@anthropic-ai/sdk";
import { sanitizeStoryHtml } from "@/lib/sanitize-html";
import { formatRoleSpeechHtml } from "@/lib/role-speech";
import type { UserRole } from "@/lib/types";

export type StoryAiProvider = "claude" | "grok";

export const MAX_STORY_HTML_CHARS = 40_000;
export const MAX_STORY_PROMPT_CHARS = 4_000;
export const MAX_STORY_DIRECTION_CHARS = 2_000;

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

/** Parse `TITLE: …` then HTML body from a model response. */
export function parseGeneratedStory(
  raw: string,
  role: UserRole
): { title: string; html: string } {
  const stripped = raw
    .replace(/^```(?:html|json|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const titled = stripped.match(/^TITLE:\s*(.+?)\s*(?:\n+)([\s\S]+)$/i);
  if (titled) {
    return {
      title: titled[1]
        .trim()
        .replace(/^["“”']+|["“”']+$/g, "")
        .slice(0, 160),
      html: cleanModelHtml(titled[2], role),
    };
  }

  const html = cleanModelHtml(stripped, role);
  const heading = html.match(/<h[23]>([\s\S]*?)<\/h[23]>/i);
  const title = heading
    ? heading[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160)
    : "";
  const body = heading ? html.replace(heading[0], "").trim() : html;
  return { title, html: body || html };
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

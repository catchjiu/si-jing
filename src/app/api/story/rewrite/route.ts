import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  isStoryRewritePromptId,
  STORY_REWRITE_PROMPT_MAP,
  type StoryRewritePromptId,
} from "@/lib/story-prompts";
import {
  sanitizeStoryHtml,
  storyHtmlHasText,
} from "@/lib/sanitize-html";
import {
  formatRoleSpeechHtml,
  roleSpeechAiInstructions,
} from "@/lib/role-speech";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HTML_CHARS = 40_000;

export type StoryRewriteProvider = "claude" | "grok";

function buildSystemPrompt(role: UserRole): string {
  return [
    "You rewrite fiction drafts for a private writing app.",
    "Return ONLY valid HTML using these tags when needed: p, br, strong, em, u, s, blockquote, ul, ol, li, h2, h3, hr.",
    "Do not wrap the response in markdown fences.",
    "Do not include commentary before or after the HTML.",
    "Preserve the author's voice, characters, and plot unless a tagged instruction requires a light structural tweak.",
    "Keep adult content if present; do not refuse solely for erotic themes between consenting adults.",
    roleSpeechAiInstructions(role),
  ]
    .filter(Boolean)
    .join(" ");
}

function cleanModelHtml(raw: string, role: UserRole): string {
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

function buildUserPrompt(
  tagInstructions: string,
  extraInstruction: string,
  html: string
): string {
  return [
    tagInstructions
      ? `Apply these writing-improvement tags:\n${tagInstructions}`
      : "Apply a focused rewrite based on the author's note.",
    extraInstruction ? `\nAdditional author note:\n${extraInstruction}` : "",
    "",
    "Rewrite this HTML story draft:",
    html,
  ]
    .filter(Boolean)
    .join("\n");
}

async function rewriteWithClaude(opts: {
  html: string;
  userPrompt: string;
  role: UserRole;
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
    max_tokens: 8192,
    system: buildSystemPrompt(opts.role),
    messages: [{ role: "user", content: opts.userPrompt }],
  });
  const textBlock = message.content.find((b) => b.type === "text");
  const rawOut =
    textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
  return cleanModelHtml(rawOut, opts.role);
}

async function rewriteWithGrok(opts: {
  html: string;
  userPrompt: string;
  role: UserRole;
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
      temperature: 0.7,
      max_tokens: 8192,
      messages: [
        { role: "system", content: buildSystemPrompt(opts.role) },
        { role: "user", content: opts.userPrompt },
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

  const rawOut = data.choices?.[0]?.message?.content?.trim() ?? "";
  return cleanModelHtml(rawOut, opts.role);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = me?.role as UserRole | undefined;
  if (role !== "slave") {
    return NextResponse.json(
      { error: "Only slave can use AI story rewrite" },
      { status: 403 }
    );
  }

  let payload: {
    html?: unknown;
    promptIds?: unknown;
    extraInstruction?: unknown;
    provider?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const providerRaw =
    typeof payload.provider === "string" ? payload.provider.toLowerCase() : "claude";
  const provider: StoryRewriteProvider =
    providerRaw === "grok" ? "grok" : "claude";

  const rawHtml = typeof payload.html === "string" ? payload.html : "";
  if (rawHtml.length > MAX_HTML_CHARS) {
    return NextResponse.json(
      { error: "Story is too long to rewrite" },
      { status: 400 }
    );
  }

  const html = sanitizeStoryHtml(rawHtml);
  if (!storyHtmlHasText(html)) {
    return NextResponse.json(
      { error: "Write some story text before rewriting" },
      { status: 400 }
    );
  }

  const promptIdsRaw = Array.isArray(payload.promptIds)
    ? payload.promptIds
    : [];
  const promptIds = [
    ...new Set(
      promptIdsRaw.filter(
        (id): id is StoryRewritePromptId =>
          typeof id === "string" && isStoryRewritePromptId(id)
      )
    ),
  ];

  const extraInstruction =
    typeof payload.extraInstruction === "string"
      ? payload.extraInstruction.trim().slice(0, 2000)
      : "";

  if (promptIds.length === 0 && !extraInstruction) {
    return NextResponse.json(
      { error: "Select at least one rewrite prompt tag or add a fix note" },
      { status: 400 }
    );
  }

  const tagInstructions = promptIds
    .map((id, i) => {
      const prompt = STORY_REWRITE_PROMPT_MAP[id];
      return `${i + 1}. ${prompt.label}: ${prompt.instruction}`;
    })
    .join("\n");

  const userPrompt = buildUserPrompt(tagInstructions, extraInstruction, html);

  try {
    const outHtml =
      provider === "grok"
        ? await rewriteWithGrok({ html, userPrompt, role })
        : await rewriteWithClaude({ html, userPrompt, role });

    if (!storyHtmlHasText(outHtml)) {
      return NextResponse.json(
        { error: "Model returned empty content" },
        { status: 502 }
      );
    }

    return NextResponse.json({ html: outHtml, provider });
  } catch (err) {
    const status =
      typeof err === "object" && err && "status" in err
        ? Number((err as { status?: number }).status) || 502
        : 502;
    let message =
      err instanceof Error ? err.message : "AI rewrite failed";

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

    console.error("story rewrite failed", { provider, err });
    return NextResponse.json({ error: message }, { status });
  }
}

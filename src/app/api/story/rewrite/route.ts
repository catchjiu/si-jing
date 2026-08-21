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

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HTML_CHARS = 40_000;

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

  if (me?.role !== "slave") {
    return NextResponse.json(
      { error: "Only slave can use Claude story rewrite" },
      { status: 403 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured on the server" },
      { status: 503 }
    );
  }

  let payload: { html?: unknown; promptIds?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

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

  if (promptIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one rewrite prompt tag" },
      { status: 400 }
    );
  }

  const instructions = promptIds
    .map((id, i) => {
      const prompt = STORY_REWRITE_PROMPT_MAP[id];
      return `${i + 1}. ${prompt.label}: ${prompt.instruction}`;
    })
    .join("\n");

  const client = new Anthropic({ apiKey });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: [
        "You rewrite fiction drafts for a private writing app.",
        "Return ONLY valid HTML using these tags when needed: p, br, strong, em, u, s, blockquote, ul, ol, li, h2, h3, hr.",
        "Do not wrap the response in markdown fences.",
        "Do not include commentary before or after the HTML.",
        "Preserve the author's voice, characters, and plot unless a tagged instruction requires a light structural tweak.",
        "Keep adult content if present; do not refuse solely for erotic themes between consenting adults.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: [
            "Apply these writing-improvement tags:",
            instructions,
            "",
            "Rewrite this HTML story draft:",
            html,
          ].join("\n"),
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    const rawOut =
      textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";
    const cleaned = rawOut
      .replace(/^```(?:html)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const outHtml = sanitizeStoryHtml(cleaned);

    if (!storyHtmlHasText(outHtml)) {
      return NextResponse.json(
        { error: "Claude returned empty content" },
        { status: 502 }
      );
    }

    return NextResponse.json({ html: outHtml });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Claude rewrite failed";
    console.error("story rewrite failed", err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isStoryRewritePromptId,
  STORY_REWRITE_PROMPT_MAP,
  type StoryRewritePromptId,
} from "@/lib/story-prompts";
import { storyHtmlHasText, sanitizeStoryHtml } from "@/lib/sanitize-html";
import { roleSpeechAiInstructions, dialogueFormatAiInstructions } from "@/lib/role-speech";
import type { UserRole } from "@/lib/types";
import {
  cleanModelHtml,
  completeStoryModel,
  MAX_STORY_HTML_CHARS,
  parseStoryAiProvider,
  storyAiFailurePayload,
  storyHtmlOutputRules,
  type StoryAiProvider,
} from "@/lib/story-ai";

export const runtime = "nodejs";
export const maxDuration = 60;

export type StoryRewriteProvider = StoryAiProvider;

function buildSystemPrompt(role: UserRole): string {
  return [
    "You rewrite fiction drafts for a private writing app.",
    storyHtmlOutputRules(),
    "Preserve the author's voice, characters, and plot unless a tagged instruction requires a light structural tweak.",
    roleSpeechAiInstructions(role),
    dialogueFormatAiInstructions(),
  ]
    .filter(Boolean)
    .join(" ");
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

  const provider = parseStoryAiProvider(payload.provider);

  const rawHtml = typeof payload.html === "string" ? payload.html : "";
  if (rawHtml.length > MAX_STORY_HTML_CHARS) {
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
    const raw = await completeStoryModel({
      provider,
      system: buildSystemPrompt(role),
      user: userPrompt,
    });
    const outHtml = cleanModelHtml(raw, role);

    if (!storyHtmlHasText(outHtml)) {
      return NextResponse.json(
        { error: "Model returned empty content" },
        { status: 502 }
      );
    }

    return NextResponse.json({ html: outHtml, provider });
  } catch (err) {
    const { status, error } = storyAiFailurePayload(err, provider);
    console.error("story rewrite failed", { provider, err });
    return NextResponse.json({ error }, { status });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  cleanModelHtml,
  completeStoryModel,
  MAX_STORY_DIRECTION_CHARS,
  MAX_STORY_HTML_CHARS,
  MAX_STORY_PROMPT_CHARS,
  parseGeneratedStory,
  parseStoryAiProvider,
  storyAiFailurePayload,
  storyHtmlOutputRules,
  type StoryAiProvider,
} from "@/lib/story-ai";
import { appendStoryHtml, storyHtmlHasText } from "@/lib/sanitize-html";
import {
  listenScriptAiInstructions,
  roleSpeechAiInstructions,
} from "@/lib/role-speech";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

function createSystemPrompt(role: UserRole): string {
  return [
    "You write complete fiction for a private writing app.",
    "Write a full short story with a beginning, middle, and end unless the prompt asks for a cliffhanger or open ending.",
    "Aim for roughly 800–1600 words unless the prompt specifies length.",
    "Follow the author's prompt closely: characters, setting, tone, kinks, and ending.",
    "Do not include a title heading in the HTML body.",
    "Produce TWO versions of the same story:",
    "1) READING — literary HTML for on-screen reading (normal prose, quotes, and attribution are fine).",
    "2) LISTEN — plain-text dual-voice script for Fish Audio TTS.",
    "Response format (exact):",
    "First line: TITLE: <story title>",
    "Then a blank line, then READING:",
    "Then the HTML body.",
    "Then a blank line, then LISTEN:",
    "Then the plain-text listen script.",
    storyHtmlOutputRules(),
    roleSpeechAiInstructions(role),
    listenScriptAiInstructions(),
  ]
    .filter(Boolean)
    .join("\n");
}

function extendSystemPrompt(role: UserRole): string {
  return [
    "You continue an existing story for a private writing app.",
    "Write the NEXT section only. Do not repeat or rewrite the existing text.",
    "Match voice, tense, point of view, characters, and tone.",
    "Produce a substantial continuation (roughly 400–900 words) unless the direction asks otherwise.",
    "If the author gave a direction, follow it closely for what happens next.",
    "If there is no direction, continue naturally from the last scene.",
    "Return ONLY HTML for the new reading continuation. Do not include a title or listen script.",
    "Use literary reading prose (quotes and attribution are fine).",
    storyHtmlOutputRules(),
    roleSpeechAiInstructions(role),
  ]
    .filter(Boolean)
    .join(" ");
}

function contextHtml(html: string): string {
  if (html.length <= MAX_STORY_HTML_CHARS) return html;
  return html.slice(html.length - MAX_STORY_HTML_CHARS);
}

async function requireAuthor(
  request: Request
): Promise<
  | { error: NextResponse }
  | { role: UserRole; provider: StoryAiProvider; payload: Record<string, unknown> }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: me } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = me?.role as UserRole | undefined;
  if (role !== "queen" && role !== "slave") {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return {
      error: NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    };
  }

  const provider = parseStoryAiProvider(payload.provider);
  return { role, provider, payload };
}

export async function POST(request: Request) {
  const auth = await requireAuthor(request);
  if ("error" in auth) return auth.error;

  const { role, provider, payload } = auth;
  const mode = payload.mode === "extend" ? "extend" : "create";

  try {
    if (mode === "create") {
      if (role !== "slave") {
        return NextResponse.json(
          { error: "Only the slave can write from a prompt" },
          { status: 403 }
        );
      }
      const prompt =
        typeof payload.prompt === "string" ? payload.prompt.trim() : "";
      if (!prompt) {
        return NextResponse.json(
          { error: "Write a prompt for the story" },
          { status: 400 }
        );
      }
      if (prompt.length > MAX_STORY_PROMPT_CHARS) {
        return NextResponse.json(
          { error: "Prompt is too long" },
          { status: 400 }
        );
      }

      const preferredTitle =
        typeof payload.title === "string" ? payload.title.trim().slice(0, 160) : "";

      const raw = await completeStoryModel({
        provider,
        maxTokens: 12288,
        temperature: 0.85,
        system: createSystemPrompt(role),
        user: [
          preferredTitle ? `Preferred title (use unless a better one fits): ${preferredTitle}` : "",
          "Write a complete story from this prompt:",
          prompt,
        ]
          .filter(Boolean)
          .join("\n\n"),
      });

      const parsed = parseGeneratedStory(raw, role);
      const title = preferredTitle || parsed.title || "Untitled story";
      if (!storyHtmlHasText(parsed.html)) {
        return NextResponse.json(
          { error: "Model returned empty content" },
          { status: 502 }
        );
      }
      return NextResponse.json({
        mode: "create",
        title,
        html: parsed.html,
        listenScript: parsed.listenScript || null,
        provider,
      });
    }

    const rawHtml = typeof payload.html === "string" ? payload.html : "";
    if (rawHtml.length > MAX_STORY_HTML_CHARS * 2) {
      return NextResponse.json(
        { error: "Story is too long to extend" },
        { status: 400 }
      );
    }
    const html = contextHtml(rawHtml);
    if (!storyHtmlHasText(html)) {
      return NextResponse.json(
        { error: "Story has no text to extend" },
        { status: 400 }
      );
    }

    const title =
      typeof payload.title === "string" ? payload.title.trim().slice(0, 160) : "";
    const direction =
      typeof payload.direction === "string"
        ? payload.direction.trim().slice(0, MAX_STORY_DIRECTION_CHARS)
        : "";

    const raw = await completeStoryModel({
      provider,
      maxTokens: 8192,
      temperature: 0.85,
      system: extendSystemPrompt(role),
      user: [
        title ? `Story title: ${title}` : "",
        direction
          ? `Author direction for what happens next:\n${direction}`
          : "No extra direction — continue naturally from the last scene.",
        html.length < rawHtml.length
          ? "(Earlier parts of the story were omitted for length. Continue from the latest text.)"
          : "",
        "Existing story HTML:",
        html,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });

    const continuation = cleanModelHtml(raw, role);
    if (!storyHtmlHasText(continuation)) {
      return NextResponse.json(
        { error: "Model returned empty content" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      mode: "extend",
      html: continuation,
      combinedHtml: appendStoryHtml(rawHtml, continuation),
      provider,
    });
  } catch (err) {
    const { status, error } = storyAiFailurePayload(err, provider);
    console.error("story generate failed", { provider, mode, err });
    return NextResponse.json({ error }, { status });
  }
}

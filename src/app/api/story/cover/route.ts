import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  sanitizeStoryHtml,
  storyHtmlExcerpt,
  storyHtmlHasText,
} from "@/lib/sanitize-html";
import { isR2Path, r2ObjectKey, toR2StoredPath } from "@/lib/storage/paths";
import { getR2ObjectBytes, putR2Object } from "@/lib/storage/r2";
import type { UserRole } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

type FaceRef = {
  role: UserRole;
  username: string;
  dataUri: string;
};

async function loadFaceDataUri(path: string | null | undefined): Promise<string | null> {
  if (!path || !isR2Path(path)) return null;
  try {
    const { body, contentType } = await getR2ObjectBytes(r2ObjectKey(path));
    const mime = contentType || "image/jpeg";
    return `data:${mime};base64,${body.toString("base64")}`;
  } catch (err) {
    console.error("Failed to load face ref", err);
    return null;
  }
}

async function buildCoverPrompt(opts: {
  title: string;
  bodyHtml: string;
  faces: FaceRef[];
}): Promise<string> {
  const excerpt = storyHtmlExcerpt(opts.bodyHtml, 500);
  const faceLines = opts.faces
    .map((f, i) => {
      const who =
        f.role === "queen"
          ? `IMAGE_${i} is the Queen's face (${f.username})`
          : `IMAGE_${i} is the slave's face (${f.username})`;
      return who;
    })
    .join(". ");

  const fallback = [
    `Cinematic blog header illustration for a private erotic romance story titled "${opts.title}".`,
    excerpt ? `Scene vibe from the story: ${excerpt}` : "",
    opts.faces.length
      ? `Preserve likenesses from the reference faces. ${faceLines}.`
      : "Atmospheric, intimate, tasteful composition.",
    "Widescreen 16:9 blog banner, moody lighting, no text, no watermarks, no logos.",
  ]
    .filter(Boolean)
    .join(" ");

  const apiKey = process.env.XAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  // Prefer Grok for the cover prompt when XAI is configured.
  if (process.env.XAI_API_KEY) {
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.XAI_STORY_MODEL?.trim() || "grok-4.5",
          temperature: 0.7,
          max_tokens: 400,
          messages: [
            {
              role: "system",
              content:
                "You write concise image-generation prompts for cinematic blog header art. Return only the prompt text, no quotes or markdown.",
            },
            {
              role: "user",
              content: [
                `Story title: ${opts.title}`,
                `Story excerpt: ${excerpt || "(no excerpt)"}`,
                opts.faces.length
                  ? `Face references available: ${faceLines}. In the prompt, refer to them as <IMAGE_0>, <IMAGE_1> when telling the image model whose face to use.`
                  : "No face references.",
                "Write one prompt for a 16:9 blog cover: atmospheric, intimate, tasteful, no text overlays.",
              ].join("\n"),
            },
          ],
        }),
      });
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (res.ok && text) return text.slice(0, 1500);
    } catch (err) {
      console.error("cover prompt via Grok failed", err);
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await client.messages.create({
        model: process.env.ANTHROPIC_STORY_MODEL?.trim() || "claude-sonnet-4-6",
        max_tokens: 400,
        system:
          "You write concise image-generation prompts for cinematic blog header art. Return only the prompt text.",
        messages: [
          {
            role: "user",
            content: [
              `Story title: ${opts.title}`,
              `Story excerpt: ${excerpt || "(no excerpt)"}`,
              opts.faces.length
                ? `Face references: ${faceLines}. Refer to them as <IMAGE_0>, <IMAGE_1> in the prompt.`
                : "No face references.",
              "One 16:9 blog cover prompt: atmospheric, intimate, tasteful, no text.",
            ].join("\n"),
          },
        ],
      });
      const block = message.content.find((b) => b.type === "text");
      if (block && block.type === "text" && block.text.trim()) {
        return block.text.trim().slice(0, 1500);
      }
    } catch (err) {
      console.error("cover prompt via Claude failed", err);
    }
  }

  return fallback;
}

async function generateCoverImage(opts: {
  prompt: string;
  faces: FaceRef[];
}): Promise<Buffer> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw Object.assign(new Error("XAI_API_KEY is not configured"), {
      status: 503,
    });
  }

  const model =
    process.env.XAI_IMAGINE_MODEL?.trim() || "grok-imagine-image-2.0";

  let res: Response;
  if (opts.faces.length > 0) {
    // Multi-image edit so Grok can lock onto Queen/slave faces.
    const promptWithRefs = opts.prompt.includes("<IMAGE_0>")
      ? opts.prompt
      : [
          opts.prompt,
          opts.faces
            .map((f, i) =>
              f.role === "queen"
                ? `Use the woman in <IMAGE_${i}> as Queen (preserve her face).`
                : `Use the man in <IMAGE_${i}> as the slave (preserve his face).`
            )
            .join(" "),
        ].join(" ");

    res = await fetch("https://api.x.ai/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: promptWithRefs,
        images: opts.faces.map((f) => ({ url: f.dataUri })),
        aspect_ratio: "16:9",
        response_format: "b64_json",
      }),
    });
  } else {
    res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt: opts.prompt,
        aspect_ratio: "16:9",
        response_format: "b64_json",
      }),
    });
  }

  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw Object.assign(
      new Error(data.error?.message || `Grok Imagine failed (${res.status})`),
      { status: 502 }
    );
  }

  const b64 = data.data?.[0]?.b64_json;
  if (b64) return Buffer.from(b64, "base64");

  const url = data.data?.[0]?.url;
  if (url) {
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error("Could not download generated image");
    return Buffer.from(await imgRes.arrayBuffer());
  }

  throw new Error("Grok Imagine returned no image");
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { storyId?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const storyId = typeof payload.storyId === "string" ? payload.storyId : "";
  if (!storyId) {
    return NextResponse.json({ error: "storyId required" }, { status: 400 });
  }

  const { data: story, error: storyError } = await supabase
    .from("stories")
    .select("id, author_id, title, body, status")
    .eq("id", storyId)
    .maybeSingle();

  if (storyError || !story) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  if (story.author_id !== user.id) {
    return NextResponse.json(
      { error: "Only the author can generate a cover" },
      { status: 403 }
    );
  }

  const bodyHtml = sanitizeStoryHtml(story.body as string);
  if (!storyHtmlHasText(bodyHtml)) {
    return NextResponse.json(
      { error: "Write the story before generating a cover" },
      { status: 400 }
    );
  }

  const { data: people } = await supabase
    .from("users")
    .select("id, role, username, face_ref_path")
    .in("role", ["queen", "slave"]);

  const faces: FaceRef[] = [];
  for (const person of people ?? []) {
    const dataUri = await loadFaceDataUri(
      person.face_ref_path as string | null
    );
    if (!dataUri) continue;
    faces.push({
      role: person.role as UserRole,
      username: (person.username as string) || person.role,
      dataUri,
    });
  }
  // Prefer Queen then slave for IMAGE_0 / IMAGE_1
  faces.sort((a, b) => {
    if (a.role === b.role) return 0;
    return a.role === "queen" ? -1 : 1;
  });

  try {
    const prompt = await buildCoverPrompt({
      title: story.title as string,
      bodyHtml,
      faces,
    });
    const imageBuf = await generateCoverImage({ prompt, faces });
    const relativePath = `${user.id}/covers/${storyId}-${Date.now()}.jpg`;
    const storedPath = toR2StoredPath("stories", relativePath);

    await putR2Object({
      key: r2ObjectKey(storedPath),
      body: imageBuf,
      contentType: "image/jpeg",
    });

    const { error: updateError } = await supabase
      .from("stories")
      .update({
        cover_image_path: storedPath,
        cover_prompt: prompt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", storyId)
      .eq("author_id", user.id);

    if (updateError) throw updateError;

    return NextResponse.json({
      cover_image_path: storedPath,
      cover_prompt: prompt,
      usedFaceRefs: faces.map((f) => f.role),
    });
  } catch (err) {
    const status =
      typeof err === "object" && err && "status" in err
        ? Number((err as { status?: number }).status) || 502
        : 502;
    const message =
      err instanceof Error ? err.message : "Cover generation failed";
    console.error("story cover failed", err);
    return NextResponse.json({ error: message }, { status });
  }
}

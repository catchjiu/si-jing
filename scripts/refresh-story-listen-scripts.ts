/**
 * Backfill / refresh Fish listen scripts for all stories.
 *
 * Prerequisites:
 * - Migration applied (listen_script + listen_body_hash columns)
 * - Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * - Env: ANTHROPIC_API_KEY (default) and/or XAI_API_KEY (--provider=grok)
 *
 * Usage:
 *   npx tsx scripts/refresh-story-listen-scripts.ts
 *   npx tsx scripts/refresh-story-listen-scripts.ts --force
 *   npx tsx scripts/refresh-story-listen-scripts.ts --dry-run --limit=3
 *   npx tsx scripts/refresh-story-listen-scripts.ts --provider=grok
 */

import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  generateListenScriptFromReading,
  parseStoryAiProvider,
  type StoryAiProvider,
} from "../src/lib/story-ai";
import { sanitizeStoryHtml, storyHtmlHasText } from "../src/lib/sanitize-html";
import { storyListenBodyHash } from "../src/lib/story-listen-hash";
import type { UserRole } from "../src/lib/types";

function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

function parseArgs(argv: string[]) {
  let force = false;
  let dryRun = false;
  let limit = Infinity;
  let provider: StoryAiProvider = "claude";
  for (const arg of argv) {
    if (arg === "--force") force = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--limit=")) {
      limit = Math.max(0, Number(arg.slice("--limit=".length)) || 0);
    } else if (arg.startsWith("--provider=")) {
      provider = parseStoryAiProvider(arg.slice("--provider=".length));
    }
  }
  return { force, dryRun, limit, provider };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnvFiles();
  const { force, dryRun, limit, provider } = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role required to update all stories)"
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: stories, error } = await supabase
    .from("stories")
    .select(
      "id, title, body, author_id, listen_script, listen_body_hash, updated_at"
    )
    .order("updated_at", { ascending: false });

  if (error) throw error;
  if (!stories?.length) {
    console.log("No stories found.");
    return;
  }

  const authorIds = [...new Set(stories.map((s) => s.author_id as string))];
  const { data: authors, error: authorsError } = await supabase
    .from("users")
    .select("id, role")
    .in("id", authorIds);
  if (authorsError) throw authorsError;

  const roleByAuthor = new Map<string, UserRole>();
  for (const row of authors ?? []) {
    roleByAuthor.set(
      row.id as string,
      row.role === "queen" ? "queen" : "slave"
    );
  }

  console.log(
    `Found ${stories.length} stor${stories.length === 1 ? "y" : "ies"} · provider=${provider}` +
      (force ? " · force" : "") +
      (dryRun ? " · dry-run" : "") +
      (Number.isFinite(limit) ? ` · limit=${limit}` : "")
  );

  let processed = 0;
  let skipped = 0;
  let updated = 0;
  let failed = 0;

  for (const story of stories) {
    if (processed >= limit) break;
    processed += 1;

    const id = story.id as string;
    const title = ((story.title as string) || "").trim();
    const html = sanitizeStoryHtml((story.body as string) || "");
    const label = title || id.slice(0, 8);

    if (!storyHtmlHasText(html)) {
      console.log(`skip  ${label} — empty body`);
      skipped += 1;
      continue;
    }

    const hash = storyListenBodyHash(title, html);
    const existing = ((story.listen_script as string) || "").trim();
    const existingHash = ((story.listen_body_hash as string) || "").trim();
    if (!force && existing && existingHash === hash) {
      console.log(`skip  ${label} — listen script already fresh`);
      skipped += 1;
      continue;
    }

    const authorRole = roleByAuthor.get(story.author_id as string) ?? "slave";
    console.log(`build ${label} (${authorRole})…`);

    try {
      const listenScript = await generateListenScriptFromReading({
        provider,
        title,
        html,
        authorRole,
      });

      if (dryRun) {
        console.log(
          `dry   ${label} — would save ${listenScript.length} chars\n---\n${listenScript.slice(0, 400)}${listenScript.length > 400 ? "…" : ""}\n---`
        );
        updated += 1;
      } else {
        const { error: updateError } = await supabase
          .from("stories")
          .update({
            listen_script: listenScript,
            listen_body_hash: hash,
          })
          .eq("id", id);
        if (updateError) throw updateError;
        console.log(`ok    ${label} — ${listenScript.length} chars`);
        updated += 1;
      }

      // Gentle pacing for model rate limits
      await sleep(800);
    } catch (err) {
      failed += 1;
      console.error(
        `fail  ${label} —`,
        err instanceof Error ? err.message : err
      );
      await sleep(1500);
    }
  }

  console.log(
    `\nDone. updated=${updated} skipped=${skipped} failed=${failed} seen=${processed}`
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});

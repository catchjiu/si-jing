import { after } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { storyAudioFilename } from "@/lib/story-audio-filename";
import {
  getR2ObjectBytes,
  presignGet,
} from "@/lib/storage/r2";
import {
  prepareStoryListenTarget,
  processStoryListenJob,
} from "@/lib/story-listen-job";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Poll listen job / cache status without starting a new job. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const storyId = new URL(request.url).searchParams.get("storyId")?.trim() || "";
  if (!storyId) {
    return NextResponse.json({ error: "storyId required" }, { status: 400 });
  }

  let prepared;
  try {
    prepared = await prepareStoryListenTarget({
      storyId,
      viewerId: user.id,
    });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status?: number }).status)
        : 500;
    const message =
      err instanceof Error ? err.message : "Could not check listen status";
    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }

  const filename = storyAudioFilename(prepared.title || undefined, storyId);

  if (prepared.exists) {
    return NextResponse.json({
      status: "ready" as const,
      cached: true,
      filename,
    });
  }

  const { data: latestJob } = await supabase
    .from("story_listen_jobs")
    .select("id, status, error, cache_key")
    .eq("story_id", storyId)
    .eq("requester_id", user.id)
    .eq("cache_key", prepared.cacheKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestJob) {
    return NextResponse.json({
      status: "idle" as const,
      filename,
    });
  }

  return NextResponse.json({
    status: latestJob.status as string,
    error: latestJob.error ?? null,
    jobId: latestJob.id,
    filename,
  });
}

function appOrigin(request: Request): string {
  const env =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "";
  if (env) return env.replace(/\/$/, "");
  return new URL(request.url).origin;
}

function processSecret(): string {
  return (
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: {
    storyId?: unknown;
    download?: unknown;
    status?: unknown;
  };
  try {
    payload = (await request.json()) as {
      storyId?: unknown;
      download?: unknown;
      status?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const storyId = typeof payload.storyId === "string" ? payload.storyId : "";
  const asDownload = payload.download === true;
  const statusOnly = payload.status === true;
  if (!storyId) {
    return NextResponse.json({ error: "storyId required" }, { status: 400 });
  }

  let prepared;
  try {
    prepared = await prepareStoryListenTarget({
      storyId,
      viewerId: user.id,
    });
  } catch (err) {
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status?: number }).status)
        : 500;
    const message =
      err instanceof Error ? err.message : "Could not prepare listen";
    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }

  const filename = storyAudioFilename(prepared.title || undefined, storyId);

  const { data: latestJob } = await supabase
    .from("story_listen_jobs")
    .select("id, status, error, audio_path, cache_key, updated_at")
    .eq("story_id", storyId)
    .eq("requester_id", user.id)
    .eq("cache_key", prepared.cacheKey)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prepared.exists) {
    if (asDownload) {
      try {
        const { body, contentType } = await getR2ObjectBytes(prepared.objectKey);
        return new NextResponse(new Uint8Array(body), {
          status: 200,
          headers: {
            "Content-Type": contentType || "audio/mpeg",
            "Content-Length": String(body.length),
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "private, max-age=3600",
          },
        });
      } catch (err) {
        console.error("story listen download failed", err);
        return NextResponse.json(
          { error: "Could not download audio" },
          { status: 502 }
        );
      }
    }

    try {
      const url = await presignGet({
        key: prepared.objectKey,
        expiresIn: 60 * 60,
      });
      return NextResponse.json({
        status: "ready" as const,
        url,
        filename,
        cached: true,
        jobId: latestJob?.id ?? null,
      });
    } catch (err) {
      console.error("story listen presign failed", err);
      return NextResponse.json(
        { error: "Could not open audio" },
        { status: 502 }
      );
    }
  }

  if (statusOnly) {
    return NextResponse.json({
      status: (latestJob?.status as string) || "missing",
      error: latestJob?.error ?? null,
      jobId: latestJob?.id ?? null,
      filename,
    });
  }

  if (asDownload) {
    return NextResponse.json(
      {
        error: "Audio is still preparing — you'll get a notification when it's ready",
        status: latestJob?.status ?? "missing",
        jobId: latestJob?.id ?? null,
      },
      { status: 409 }
    );
  }

  if (latestJob?.status === "queued" || latestJob?.status === "running") {
    return NextResponse.json({
      status: latestJob.status,
      jobId: latestJob.id,
      filename,
    });
  }

  const { data: job, error: jobError } = await supabase
    .from("story_listen_jobs")
    .insert({
      story_id: storyId,
      requester_id: user.id,
      cache_key: prepared.cacheKey,
      status: "queued",
      title: prepared.title,
      updated_at: new Date().toISOString(),
    })
    .select("id, status")
    .single();

  if (jobError || !job) {
    // Unique active job race — return the existing one
    const { data: existing } = await supabase
      .from("story_listen_jobs")
      .select("id, status")
      .eq("story_id", storyId)
      .eq("cache_key", prepared.cacheKey)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        status: existing.status,
        jobId: existing.id,
        filename,
      });
    }
    console.error("story listen job insert failed", jobError);
    return NextResponse.json(
      { error: jobError?.message || "Could not queue listen job" },
      { status: 500 }
    );
  }

  const jobId = job.id as string;
  const origin = appOrigin(request);
  const secret = processSecret();

  after(() => {
    void (async () => {
      try {
        if (secret) {
          const res = await fetch(`${origin}/api/story/listen/process`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${secret}`,
            },
            body: JSON.stringify({ jobId }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            console.error("listen process kickoff failed", res.status, text);
            await processStoryListenJob(jobId);
          }
        } else {
          await processStoryListenJob(jobId);
        }
      } catch (err) {
        console.error("listen after() failed", err);
        try {
          await processStoryListenJob(jobId);
        } catch (inner) {
          console.error("listen process fallback failed", inner);
        }
      }
    })();
  });

  return NextResponse.json({
    status: "queued" as const,
    jobId,
    filename,
  });
}

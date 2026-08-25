import { NextResponse } from "next/server";
import { processStoryListenJob } from "@/lib/story-listen-job";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret =
    process.env.CRON_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    "";
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

/** Internal worker: synthesize Story Listen audio and notify the requester. */
export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let jobId = "";
  try {
    const body = (await request.json()) as { jobId?: unknown };
    jobId = typeof body.jobId === "string" ? body.jobId : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  try {
    await processStoryListenJob(jobId);
    return NextResponse.json({ ok: true, jobId });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Listen job processing failed";
    console.error("listen process route failed", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isStorageBucket,
  toR2StoredPath,
  type StorageBucket,
} from "@/lib/storage/paths";
import { presignPut } from "@/lib/storage/r2";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    bucket?: string;
    contentType?: string;
    ext?: string;
    relativePath?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.bucket || !isStorageBucket(body.bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }
  if (!body.contentType || typeof body.contentType !== "string") {
    return NextResponse.json({ error: "contentType required" }, { status: 400 });
  }

  const bucket = body.bucket as StorageBucket;
  const ext = (body.ext || "bin").replace(/[^a-zA-Z0-9]/g, "") || "bin";
  const relativePath =
    body.relativePath?.replace(/^\/+/, "") ||
    `${user.id}/${Date.now()}.${ext}`;

  // Ensure uploads stay under the caller's folder unless they already include user id
  const safeRelative = relativePath.startsWith(`${user.id}/`)
    ? relativePath
    : `${user.id}/${relativePath}`;

  const path = toR2StoredPath(bucket, safeRelative);
  const key = `${bucket}/${safeRelative}`;

  try {
    const uploadUrl = await presignPut({
      key,
      contentType: body.contentType,
    });
    return NextResponse.json({ uploadUrl, path });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Presign failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

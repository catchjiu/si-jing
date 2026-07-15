import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  isStorageBucket,
  toR2StoredPath,
  type StorageBucket,
} from "@/lib/storage/paths";
import { putR2Object } from "@/lib/storage/r2";
import {
  shouldWatermarkUpload,
  watermarkImageBuffer,
} from "@/lib/storage/watermark-server";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 50 MB — matches client video max */
const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid upload body — file may be too large for the proxy" },
      { status: 400 }
    );
  }

  const bucketRaw = form.get("bucket");
  const contentTypeRaw = form.get("contentType");
  const extRaw = form.get("ext");
  const relativePathRaw = form.get("relativePath");
  const file = form.get("file");

  if (typeof bucketRaw !== "string" || !isStorageBucket(bucketRaw)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }
  if (typeof contentTypeRaw !== "string" || !contentTypeRaw) {
    return NextResponse.json({ error: "contentType required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 50 MB)" },
      { status: 413 }
    );
  }

  const bucket = bucketRaw as StorageBucket;
  let contentType = contentTypeRaw;
  let ext =
    (typeof extRaw === "string" ? extRaw : "bin").replace(/[^a-zA-Z0-9]/g, "") ||
    "bin";
  let relativePath =
    (typeof relativePathRaw === "string" ? relativePathRaw : "")
      .replace(/^\/+/, "") || `${user.id}/${Date.now()}.${ext}`;

  let body: Buffer = Buffer.from(await file.arrayBuffer());

  if (
    shouldWatermarkUpload({
      contentType,
      relativePath,
    })
  ) {
    try {
      const stamped = await watermarkImageBuffer(body, contentType);
      body = Buffer.from(stamped.buffer);
      contentType = stamped.contentType;
      ext = stamped.ext;
      relativePath = relativePath.replace(/\.[^.]+$/, `.${ext}`);
    } catch (err) {
      console.error("watermark failed, uploading original", err);
    }
  }

  const safeRelative = relativePath.startsWith(`${user.id}/`)
    ? relativePath
    : `${user.id}/${relativePath}`;

  const path = toR2StoredPath(bucket, safeRelative);
  const key = `${bucket}/${safeRelative}`;

  try {
    await putR2Object({
      key,
      body,
      contentType,
    });
    return NextResponse.json({ path });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

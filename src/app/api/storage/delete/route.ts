import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isStorageBucket, type StorageBucket } from "@/lib/storage/paths";
import { deleteStoredObject } from "@/lib/storage/sign";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { bucket?: string; path?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.bucket || !isStorageBucket(body.bucket)) {
    return NextResponse.json({ error: "Invalid bucket" }, { status: 400 });
  }
  if (!body.path || typeof body.path !== "string") {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  try {
    await deleteStoredObject(body.bucket as StorageBucket, body.path);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

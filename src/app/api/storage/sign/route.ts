import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isStorageBucket, type StorageBucket } from "@/lib/storage/paths";
import { getSignedUrl } from "@/lib/storage/sign";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { bucket?: string; path?: string; expiresIn?: number };
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

  const expiresIn =
    typeof body.expiresIn === "number" && body.expiresIn > 0
      ? Math.min(body.expiresIn, 60 * 60 * 24 * 7)
      : 3600;

  try {
    const url = await getSignedUrl(
      body.bucket as StorageBucket,
      body.path,
      expiresIn
    );
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

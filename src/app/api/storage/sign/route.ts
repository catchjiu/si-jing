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

  // Harden premiere teases: slaves cannot sign burned / locked / out-of-window media
  if (body.bucket === "teases") {
    const { data: roleRow } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (roleRow?.role === "slave") {
      const { data: tease } = await supabase
        .from("teases")
        .select(
          "premiere_kind, burned_at, expired_at, unlocks_at, premiere_closes_at, sent_to, is_blurred"
        )
        .eq("image_path", body.path)
        .maybeSingle();
      if (tease?.premiere_kind) {
        if (tease.sent_to !== user.id) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (tease.burned_at || tease.expired_at) {
          return NextResponse.json(
            { error: "This premiere is burned" },
            { status: 403 }
          );
        }
        if (new Date(tease.unlocks_at) > new Date()) {
          return NextResponse.json(
            { error: "Premiere has not opened yet" },
            { status: 403 }
          );
        }
        if (
          tease.premiere_kind === "timed" &&
          tease.premiere_closes_at &&
          new Date(tease.premiere_closes_at) < new Date()
        ) {
          return NextResponse.json(
            { error: "Premiere window has closed" },
            { status: 403 }
          );
        }
        if (tease.is_blurred) {
          return NextResponse.json(
            { error: "Premiere is not ready yet" },
            { status: 403 }
          );
        }
      } else if (tease && new Date(tease.unlocks_at) > new Date()) {
        return NextResponse.json(
          { error: "Tease is still locked" },
          { status: 403 }
        );
      }
    }
  }

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

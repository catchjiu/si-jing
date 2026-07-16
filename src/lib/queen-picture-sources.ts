import type { SupabaseClient } from "@supabase/supabase-js";
import { signObjectUrl } from "@/lib/storage/client";
import type { StorageBucket } from "@/lib/storage/paths";
import type { ImageLocationSource } from "@/lib/types";

export type QueenPictureSourceType = "reward" | "tease";

export type QueenPictureSource = {
  sourceType: QueenPictureSourceType;
  sourceId: string;
  imagePath: string;
  storageBucket: StorageBucket;
  signedUrl?: string;
  label: string;
  subtitle?: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  location_source: ImageLocationSource | null;
};

export async function fetchQueenPictureSources(
  supabase: SupabaseClient,
  slaveId: string
): Promise<QueenPictureSource[]> {
  const now = new Date().toISOString();

  const [{ data: rewards }, { data: teases }] = await Promise.all([
    supabase
      .from("rewards")
      .select(
        "id, title, message, image_path, latitude, longitude, accuracy_m, location_source, created_at"
      )
      .eq("sent_to", slaveId)
      .not("image_path", "is", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("teases")
      .select(
        "id, title, image_path, latitude, longitude, accuracy_m, location_source, created_at, unblurred_at"
      )
      .eq("sent_to", slaveId)
      .eq("is_blurred", false)
      .eq("media_kind", "image")
      .not("image_path", "is", null)
      .lte("unlocks_at", now)
      .order("created_at", { ascending: false }),
  ]);

  const items: QueenPictureSource[] = [];

  for (const row of rewards ?? []) {
    if (!row.image_path) continue;
    items.push({
      sourceType: "reward",
      sourceId: row.id as string,
      imagePath: row.image_path as string,
      storageBucket: "rewards",
      label: (row.title as string | null) || "Reward",
      subtitle: (row.message as string | null) ?? null,
      latitude: (row.latitude as number | null) ?? null,
      longitude: (row.longitude as number | null) ?? null,
      accuracy_m: (row.accuracy_m as number | null) ?? null,
      location_source:
        (row.location_source as ImageLocationSource | null) ?? null,
    });
  }

  for (const row of teases ?? []) {
    if (!row.image_path) continue;
    items.push({
      sourceType: "tease",
      sourceId: row.id as string,
      imagePath: row.image_path as string,
      storageBucket: "teases",
      label: (row.title as string | null) || "Revealed tease",
      subtitle: row.unblurred_at
        ? `Revealed ${new Date(row.unblurred_at as string).toLocaleDateString()}`
        : null,
      latitude: (row.latitude as number | null) ?? null,
      longitude: (row.longitude as number | null) ?? null,
      accuracy_m: (row.accuracy_m as number | null) ?? null,
      location_source:
        (row.location_source as ImageLocationSource | null) ?? null,
    });
  }

  return Promise.all(
    items.map(async (item) => ({
      ...item,
      signedUrl:
        (await signObjectUrl({
          bucket: item.storageBucket,
          path: item.imagePath,
        })) ?? undefined,
    }))
  );
}

export async function filterAlreadySavedQueenPictures(
  supabase: SupabaseClient,
  galleryId: string,
  items: QueenPictureSource[]
): Promise<QueenPictureSource[]> {
  if (items.length === 0) return items;

  const { data: existing } = await supabase
    .from("worship_entries")
    .select("source_type, source_id")
    .eq("gallery_id", galleryId)
    .not("source_id", "is", null);

  const saved = new Set(
    (existing ?? []).map(
      (row) => `${row.source_type as string}:${row.source_id as string}`
    )
  );

  return items.filter(
    (item) => !saved.has(`${item.sourceType}:${item.sourceId}`)
  );
}

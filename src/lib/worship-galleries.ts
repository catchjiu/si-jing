"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { signObjectUrl } from "@/lib/storage/client";
import type {
  WorshipEntry,
  WorshipGalleryTopic,
  WorshipGalleryTopicWithMeta,
} from "@/lib/types";

export async function loadWorshipGalleriesWithMeta(
  supabase: SupabaseClient,
  galleries: WorshipGalleryTopic[]
): Promise<WorshipGalleryTopicWithMeta[]> {
  if (galleries.length === 0) return [];

  const galleryIds = galleries.map((g) => g.id);
  const { data: entries } = await supabase
    .from("worship_entries")
    .select("id, gallery_id, image_path, love_level, viewed_at, created_at")
    .in("gallery_id", galleryIds)
    .order("created_at", { ascending: false });

  const byGallery = new Map<
    string,
    {
      count: number;
      unviewed: number;
      loveSum: number;
      coverPath: string | null;
    }
  >();

  for (const id of galleryIds) {
    byGallery.set(id, {
      count: 0,
      unviewed: 0,
      loveSum: 0,
      coverPath: null,
    });
  }

  for (const row of entries ?? []) {
    const meta = byGallery.get(row.gallery_id as string);
    if (!meta) continue;
    meta.count += 1;
    if (!row.viewed_at) meta.unviewed += 1;
    meta.loveSum += row.love_level as number;
    if (!meta.coverPath) {
      meta.coverPath = row.image_path as string;
    }
  }

  return Promise.all(
    galleries.map(async (gallery) => {
      const meta = byGallery.get(gallery.id)!;
      let coverSignedUrl: string | undefined;
      if (meta.coverPath) {
        try {
          coverSignedUrl =
            (await signObjectUrl({
              bucket: "worship",
              path: meta.coverPath,
            })) ?? undefined;
        } catch {
          coverSignedUrl = undefined;
        }
      }

      return {
        ...gallery,
        coverSignedUrl,
        entryCount: meta.count,
        unviewedCount: meta.unviewed,
        avgLoveLevel:
          meta.count > 0 ? Math.round(meta.loveSum / meta.count) : null,
      };
    })
  );
}

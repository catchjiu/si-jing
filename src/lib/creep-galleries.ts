"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { signObjectUrl } from "@/lib/storage/client";
import type {
  CreepGallery,
  CreepGalleryWithMeta,
  CreepMediaKind,
} from "@/lib/types";

export async function loadCreepGalleriesWithMeta(
  supabase: SupabaseClient,
  galleries: CreepGallery[]
): Promise<CreepGalleryWithMeta[]> {
  if (galleries.length === 0) return [];

  const galleryIds = galleries.map((g) => g.id);
  const { data: entries } = await supabase
    .from("creep_entries")
    .select("id, gallery_id, image_path, media_kind, viewed_at, created_at")
    .in("gallery_id", galleryIds)
    .order("created_at", { ascending: false });

  const byGallery = new Map<
    string,
    {
      count: number;
      unviewed: number;
      coverPath: string | null;
      coverMediaKind: CreepMediaKind;
    }
  >();

  for (const id of galleryIds) {
    byGallery.set(id, {
      count: 0,
      unviewed: 0,
      coverPath: null,
      coverMediaKind: "image",
    });
  }

  for (const row of entries ?? []) {
    const meta = byGallery.get(row.gallery_id as string);
    if (!meta) continue;
    meta.count += 1;
    if (!row.viewed_at) meta.unviewed += 1;
    const kind: CreepMediaKind =
      (row.media_kind as string) === "video" ? "video" : "image";
    if (!meta.coverPath) {
      meta.coverPath = row.image_path as string;
      meta.coverMediaKind = kind;
    } else if (meta.coverMediaKind === "video" && kind === "image") {
      meta.coverPath = row.image_path as string;
      meta.coverMediaKind = kind;
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
              bucket: "creep",
              path: meta.coverPath,
            })) ?? undefined;
        } catch {
          coverSignedUrl = undefined;
        }
      }
      return {
        ...gallery,
        coverSignedUrl,
        coverMediaKind: meta.coverMediaKind,
        entryCount: meta.count,
        unviewedCount: meta.unviewed,
      };
    })
  );
}

import { signObjectUrl } from "@/lib/storage/client";
import {
  isR2Path,
  isStorageBucket,
  type StorageBucket,
} from "@/lib/storage/paths";
import type { WorshipEntry } from "@/lib/types";

type WorshipMediaRef = Pick<WorshipEntry, "image_path" | "storage_bucket">;

export function worshipEntryStorageBucket(
  entry: WorshipMediaRef
): StorageBucket {
  if (entry.storage_bucket && isStorageBucket(entry.storage_bucket)) {
    return entry.storage_bucket;
  }

  if (isR2Path(entry.image_path)) {
    const bucket = entry.image_path.slice("r2/".length).split("/")[0];
    if (isStorageBucket(bucket)) return bucket;
  }

  return "worship";
}

export function isOwnedWorshipUpload(entry: WorshipMediaRef): boolean {
  return worshipEntryStorageBucket(entry) === "worship";
}

export async function signWorshipEntryUrl(
  entry: WorshipMediaRef,
  expiresIn?: number
): Promise<string | null> {
  if (!entry.image_path) return null;
  return signObjectUrl({
    bucket: worshipEntryStorageBucket(entry),
    path: entry.image_path,
    expiresIn,
  });
}

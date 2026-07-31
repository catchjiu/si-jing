export const STORAGE_BUCKETS = [
  "rewards",
  "teases",
  "tease_reactions",
  "submissions",
  "wishlist",
  "worship",
  "date_posts",
  "flirt",
  "workouts",
  "voice",
  "messages",
] as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[number];

const R2_PREFIX = "r2/";

export function isStorageBucket(value: string): value is StorageBucket {
  return (STORAGE_BUCKETS as readonly string[]).includes(value);
}

export function isR2Path(path: string): boolean {
  return path.startsWith(R2_PREFIX);
}

/** DB path for a new R2 object: r2/{bucket}/{relativePath} */
export function toR2StoredPath(bucket: StorageBucket, relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, "");
  return `${R2_PREFIX}${bucket}/${clean}`;
}

/** Object key inside the single R2 bucket (without r2/ prefix). */
export function r2ObjectKey(storedPath: string): string {
  if (!isR2Path(storedPath)) {
    throw new Error("Not an R2 storage path");
  }
  return storedPath.slice(R2_PREFIX.length);
}

/** Relative path as stored historically in Supabase (no bucket prefix). */
export function supabaseRelativePath(storedPath: string): string {
  if (isR2Path(storedPath)) {
    throw new Error("R2 path cannot be used with Supabase relative helper");
  }
  return storedPath;
}

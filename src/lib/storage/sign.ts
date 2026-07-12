import { createClient } from "@/lib/supabase/server";
import {
  isR2Path,
  r2ObjectKey,
  type StorageBucket,
} from "@/lib/storage/paths";
import { presignGet, removeR2Object } from "@/lib/storage/r2";

export async function getSignedUrl(
  bucket: StorageBucket,
  path: string,
  expiresIn = 3600
): Promise<string | null> {
  if (!path) return null;

  if (isR2Path(path)) {
    return presignGet({ key: r2ObjectKey(path), expiresIn });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

export async function deleteStoredObject(
  bucket: StorageBucket,
  path: string
): Promise<void> {
  if (!path) return;

  if (isR2Path(path)) {
    await removeR2Object(r2ObjectKey(path));
    return;
  }

  const supabase = await createClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

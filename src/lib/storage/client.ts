import { createClient } from "@/lib/supabase/client";
import { isR2Path, type StorageBucket } from "@/lib/storage/paths";

async function storageFetch<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Storage request failed (${res.status})`);
  }
  return data;
}

/**
 * Presign an R2 upload, PUT the file, return the DB path (`r2/{bucket}/...`).
 */
export async function presignAndUpload(opts: {
  bucket: StorageBucket;
  file: Blob;
  contentType?: string;
  ext?: string;
  /** Optional relative path under the bucket (without r2/ or bucket). */
  relativePath?: string;
}): Promise<string> {
  const contentType =
    opts.contentType || opts.file.type || "application/octet-stream";
  const ext =
    opts.ext ||
    contentType.split("/")[1]?.replace("jpeg", "jpg") ||
    "bin";

  const { uploadUrl, path } = await storageFetch<{
    uploadUrl: string;
    path: string;
  }>("/api/storage/presign-upload", {
    bucket: opts.bucket,
    contentType,
    ext,
    relativePath: opts.relativePath,
  });

  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: opts.file,
  });
  if (!put.ok) {
    throw new Error(`Upload to R2 failed (${put.status})`);
  }

  return path;
}

export async function signObjectUrl(opts: {
  bucket: StorageBucket;
  path: string;
  expiresIn?: number;
}): Promise<string | null> {
  if (!opts.path) return null;
  // Already a full URL (legacy avatar signed URLs)
  if (/^https?:\/\//i.test(opts.path)) return opts.path;

  const expiresIn = opts.expiresIn ?? 3600;

  try {
    const { url } = await storageFetch<{ url: string | null }>(
      "/api/storage/sign",
      {
        bucket: opts.bucket,
        path: opts.path,
        expiresIn,
      }
    );
    return url;
  } catch (err) {
    // Legacy Supabase objects can be signed directly from the browser
    if (!isR2Path(opts.path)) {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from(opts.bucket)
        .createSignedUrl(opts.path, expiresIn);
      if (!error && data?.signedUrl) return data.signedUrl;
    }
    throw err;
  }
}

export async function removeObject(opts: {
  bucket: StorageBucket;
  path: string;
}): Promise<void> {
  if (!opts.path || /^https?:\/\//i.test(opts.path)) return;

  try {
    await storageFetch("/api/storage/delete", {
      bucket: opts.bucket,
      path: opts.path,
    });
  } catch (err) {
    if (!isR2Path(opts.path)) {
      const supabase = createClient();
      const { error } = await supabase.storage
        .from(opts.bucket)
        .remove([opts.path]);
      if (!error) return;
    }
    throw err;
  }
}

export async function signObjectUrls(
  bucket: StorageBucket,
  paths: (string | null | undefined)[],
  expiresIn?: number
): Promise<(string | null)[]> {
  return Promise.all(
    paths.map((path) =>
      path
        ? signObjectUrl({ bucket, path, expiresIn })
        : Promise.resolve(null)
    )
  );
}

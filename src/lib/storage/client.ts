import { createClient } from "@/lib/supabase/client";
import { isR2Path, type StorageBucket } from "@/lib/storage/paths";

function friendlyStorageError(err: unknown, fallback: string): Error {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : fallback;
  // Safari/WebKit often reports failed cross-origin or network PUTs as this
  if (raw === "Load failed" || raw === "Failed to fetch" || /networkerror/i.test(raw)) {
    return new Error(
      "Upload failed — check your connection and try a smaller video (max 50 MB)"
    );
  }
  return err instanceof Error ? err : new Error(raw || fallback);
}

async function storageFetchJson<T>(url: string, body: unknown): Promise<T> {
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
 * Upload a file to R2 via the app server (avoids browser→R2 CORS).
 * Falls back to a presigned PUT if the reverse proxy rejects a large body.
 * Returns the DB path (`r2/{bucket}/...`).
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

  const form = new FormData();
  form.append("bucket", opts.bucket);
  form.append("contentType", contentType);
  form.append("ext", ext);
  if (opts.relativePath) form.append("relativePath", opts.relativePath);
  form.append(
    "file",
    opts.file,
    opts.file instanceof File ? opts.file.name : `upload.${ext}`
  );

  try {
    const res = await fetch("/api/storage/upload", {
      method: "POST",
      body: form,
    });
    const data = (await res.json().catch(() => ({}))) as {
      path?: string;
      error?: string;
    };

    if (res.ok && data.path) return data.path;

    const proxyTooLarge =
      res.status === 413 ||
      /too large/i.test(data.error || "") ||
      /payload/i.test(data.error || "");

    if (!proxyTooLarge) {
      throw new Error(data.error || `Upload failed (${res.status})`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // Network errors on the same-origin upload are real failures
    if (msg && !/too large|payload|413/i.test(msg)) {
      throw friendlyStorageError(err, "Upload failed");
    }
  }

  // Fallback: browser PUT to R2 (requires bucket CORS for the app origin)
  try {
    const { uploadUrl, path } = await storageFetchJson<{
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
  } catch (err) {
    throw friendlyStorageError(err, "Upload failed");
  }
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function signObjectUrl(opts: {
  bucket: StorageBucket;
  path: string;
  expiresIn?: number;
}): Promise<string | null> {
  if (!opts.path) return null;
  // Already a full URL (legacy avatar signed URLs)
  if (/^https?:\/\//i.test(opts.path)) return opts.path;

  const expiresIn = opts.expiresIn ?? 3600;
  const cacheKey = `${opts.bucket}:${opts.path}`;
  const cached = signedUrlCache.get(cacheKey);
  const now = Date.now();
  // Refresh 2 minutes before expiry
  if (cached && cached.expiresAt - now > 120_000) {
    return cached.url;
  }

  try {
    const { url } = await storageFetchJson<{ url: string | null }>(
      "/api/storage/sign",
      {
        bucket: opts.bucket,
        path: opts.path,
        expiresIn,
      }
    );
    if (url) {
      signedUrlCache.set(cacheKey, {
        url,
        expiresAt: now + expiresIn * 1000,
      });
    }
    return url;
  } catch (err) {
    // Legacy Supabase objects can be signed directly from the browser
    if (!isR2Path(opts.path)) {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from(opts.bucket)
        .createSignedUrl(opts.path, expiresIn);
      if (!error && data?.signedUrl) {
        signedUrlCache.set(cacheKey, {
          url: data.signedUrl,
          expiresAt: now + expiresIn * 1000,
        });
        return data.signedUrl;
      }
    }
    throw friendlyStorageError(err, "Could not load media");
  }
}

export async function removeObject(opts: {
  bucket: StorageBucket;
  path: string;
}): Promise<void> {
  if (!opts.path || /^https?:\/\//i.test(opts.path)) return;
  signedUrlCache.delete(`${opts.bucket}:${opts.path}`);

  try {
    await storageFetchJson("/api/storage/delete", {
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
    throw friendlyStorageError(err, "Could not delete media");
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

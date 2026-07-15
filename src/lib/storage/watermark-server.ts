import path from "path";
import { readFile } from "fs/promises";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/** Skip avatar uploads and non-raster images (GIF keeps animation). */
export function shouldWatermarkUpload(opts: {
  contentType: string;
  relativePath?: string | null;
}): boolean {
  const type = opts.contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!IMAGE_TYPES.has(type)) return false;
  const rel = (opts.relativePath ?? "").replace(/^\/+/, "").toLowerCase();
  if (rel.includes("/avatars/") || rel.startsWith("avatars/")) return false;
  return true;
}

let watermarkPngCache: Buffer | null = null;

export async function loadProofWatermarkPng(): Promise<Buffer> {
  if (watermarkPngCache) return watermarkPngCache;
  const filePath = path.join(
    process.cwd(),
    "public",
    "brand",
    "proof-watermark.png"
  );
  watermarkPngCache = await readFile(filePath);
  return watermarkPngCache;
}

/**
 * Composite the Queen Sisi proof mark into the bottom-right of an image.
 * Returns JPEG buffer (or PNG if input was PNG and we keep alpha-less jpeg always for size).
 */
export async function watermarkImageBuffer(
  input: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  const sharp = (await import("sharp")).default;
  const watermark = await loadProofWatermarkPng();

  const image = sharp(input, { failOn: "none" }).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) {
    return {
      buffer: input,
      contentType,
      ext: contentType.includes("png") ? "png" : "jpg",
    };
  }

  const targetWmWidth = Math.max(
    72,
    Math.min(Math.round(width * 0.28), 420)
  );
  const resizedWm = await sharp(watermark)
    .resize({ width: targetWmWidth, withoutEnlargement: true })
    .ensureAlpha()
    .png()
    .toBuffer();

  const wmMeta = await sharp(resizedWm).metadata();
  const wmW = wmMeta.width ?? targetWmWidth;
  const wmH = wmMeta.height ?? Math.round(targetWmWidth * 1.04);
  const margin = Math.max(8, Math.round(width * 0.02));
  const left = Math.max(0, width - wmW - margin);
  const top = Math.max(0, height - wmH - margin);

  // Flatten onto dark-neutral for formats with transparency, then composite watermark
  const composited = image
    .ensureAlpha()
    .composite([
      {
        input: resizedWm,
        left,
        top,
        blend: "over",
      },
    ]);

  // Prefer JPEG for photos; keep PNG if source was PNG with likely graphics
  const asPng = contentType.includes("png");
  if (asPng) {
    const buffer = await composited.png({ compressionLevel: 8 }).toBuffer();
    return { buffer, contentType: "image/png", ext: "png" };
  }

  const buffer = await composited
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  return { buffer, contentType: "image/jpeg", ext: "jpg" };
}

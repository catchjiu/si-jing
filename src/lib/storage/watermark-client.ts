"use client";

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

export function shouldWatermarkUploadClient(opts: {
  contentType: string;
  relativePath?: string | null;
}): boolean {
  const type = opts.contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (!IMAGE_TYPES.has(type)) return false;
  const rel = (opts.relativePath ?? "").replace(/^\/+/, "").toLowerCase();
  if (rel.includes("/avatars/") || rel.startsWith("avatars/")) return false;
  if (rel.includes("/face-refs/") || rel.startsWith("face-refs/")) return false;
  if (rel.includes("/covers/") || rel.startsWith("covers/")) return false;
  return true;
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image for watermark"));
    };
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

let watermarkImgPromise: Promise<HTMLImageElement> | null = null;

function loadWatermarkImage(): Promise<HTMLImageElement> {
  if (!watermarkImgPromise) {
    watermarkImgPromise = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load proof watermark"));
      img.src = "/brand/proof-watermark.png";
    });
  }
  return watermarkImgPromise;
}

/**
 * Draw the proof watermark into the bottom-right corner of an image blob.
 * Used for the browser→R2 presign fallback path (server upload already watermarks).
 */
export async function watermarkImageBlob(opts: {
  file: Blob;
  contentType: string;
}): Promise<{ file: Blob; contentType: string; ext: string }> {
  const source = await loadImageFromBlob(opts.file);
  const wm = await loadWatermarkImage();

  const width = source.naturalWidth || source.width;
  const height = source.naturalHeight || source.height;
  if (!width || !height) {
    return {
      file: opts.file,
      contentType: opts.contentType,
      ext: opts.contentType.includes("png") ? "png" : "jpg",
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      file: opts.file,
      contentType: opts.contentType,
      ext: opts.contentType.includes("png") ? "png" : "jpg",
    };
  }

  ctx.drawImage(source, 0, 0, width, height);

  const targetWmWidth = Math.max(72, Math.min(Math.round(width * 0.28), 420));
  const scale = targetWmWidth / (wm.naturalWidth || wm.width || 1);
  const wmW = targetWmWidth;
  const wmH = Math.round((wm.naturalHeight || wm.height || 1) * scale);
  const margin = Math.max(8, Math.round(width * 0.02));
  const left = Math.max(0, width - wmW - margin);
  const top = Math.max(0, height - wmH - margin);

  ctx.globalAlpha = 0.92;
  ctx.drawImage(wm, left, top, wmW, wmH);
  ctx.globalAlpha = 1;

  const asPng = opts.contentType.includes("png");
  const outType = asPng ? "image/png" : "image/jpeg";
  const blob = await canvasToBlob(canvas, outType, 0.88);
  if (!blob) {
    return {
      file: opts.file,
      contentType: opts.contentType,
      ext: asPng ? "png" : "jpg",
    };
  }

  return {
    file: blob,
    contentType: outType,
    ext: asPng ? "png" : "jpg",
  };
}

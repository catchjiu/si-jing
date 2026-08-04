import exifr from "exifr";

export type GeoPoint = {
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  source: "exif" | "device";
};

/** Best-effort capture time from EXIF (UTC Date). */
export async function readImageDateTime(file: File): Promise<Date | null> {
  try {
    const tags = await exifr.parse(file, {
      pick: ["DateTimeOriginal", "CreateDate", "ModifyDate"],
    });
    if (!tags || typeof tags !== "object") return null;
    const raw =
      (tags as Record<string, unknown>).DateTimeOriginal ??
      (tags as Record<string, unknown>).CreateDate ??
      (tags as Record<string, unknown>).ModifyDate;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
    if (typeof raw === "string" || typeof raw === "number") {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function appleMapsUrl(lat: number, lng: number): string {
  return `https://maps.apple.com/?ll=${lat},${lng}&q=${lat},${lng}`;
}

export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(5)}°${ns}, ${Math.abs(lng).toFixed(5)}°${ew}`;
}

export function formatAccuracy(meters: number | null | undefined): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `±${Math.round(meters)} m`;
  return `±${(meters / 1000).toFixed(1)} km`;
}

/** One-shot GPS from the browser (iPhone Safari / PWA). */
export function getCurrentPosition(
  options?: PositionOptions
): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Location is not supported in this browser"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_m:
            typeof pos.coords.accuracy === "number"
              ? pos.coords.accuracy
              : null,
          source: "device",
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error("Location permission denied"));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error("Location timed out — try again"));
        } else {
          reject(new Error(err.message || "Could not get location"));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
        ...options,
      }
    );
  });
}

/** Read GPS from image EXIF when present (often stripped on iOS). */
export async function readImageGps(file: File): Promise<GeoPoint | null> {
  try {
    const gps = await exifr.gps(file);
    if (
      !gps ||
      typeof gps.latitude !== "number" ||
      typeof gps.longitude !== "number" ||
      !Number.isFinite(gps.latitude) ||
      !Number.isFinite(gps.longitude)
    ) {
      return null;
    }
    return {
      latitude: gps.latitude,
      longitude: gps.longitude,
      accuracy_m: null,
      source: "exif",
    };
  } catch {
    return null;
  }
}

/**
 * Prefer EXIF GPS from the original file; fall back to device location.
 * Returns null if both fail (caller should still allow upload).
 */
export async function resolveImageLocation(
  file: File
): Promise<GeoPoint | null> {
  const fromExif = await readImageGps(file);
  if (fromExif) return fromExif;
  try {
    return await getCurrentPosition();
  } catch {
    return null;
  }
}

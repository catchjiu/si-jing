export const CREEP_QUOTE =
  "slave loving things about his Queen, she doesn't love about Herself.";

export const CREEP_RESERVED_SLUGS = new Set(["fart", "gallery"]);

export function slugifyCreepTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "gallery";
}

export function uniqueCreepSlug(title: string, existing: string[]): string {
  const taken = new Set(existing);
  const base = slugifyCreepTitle(title);
  let candidate = CREEP_RESERVED_SLUGS.has(base) ? `${base}-album` : base;
  if (!taken.has(candidate)) return candidate;
  let n = 2;
  while (taken.has(`${candidate}-${n}`)) n += 1;
  return `${candidate}-${n}`;
}

export function creepHubHref(): string {
  return "/dashboard/creep";
}

export function creepFartHref(opts?: {
  entryId?: string | null;
  commentId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (opts?.entryId) params.set("fart", opts.entryId);
  if (opts?.commentId) params.set("comment", opts.commentId);
  const qs = params.toString();
  return qs ? `/dashboard/creep/fart?${qs}` : "/dashboard/creep/fart";
}

export function creepGalleryHref(
  galleryId: string,
  opts?: { entryId?: string | null; commentId?: string | null }
): string {
  const params = new URLSearchParams();
  if (opts?.entryId) params.set("entry", opts.entryId);
  if (opts?.commentId) params.set("comment", opts.commentId);
  const qs = params.toString();
  return qs
    ? `/dashboard/creep/gallery/${galleryId}?${qs}`
    : `/dashboard/creep/gallery/${galleryId}`;
}

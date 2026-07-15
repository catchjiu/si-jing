"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import { getYouTubeEmbedUrl } from "@/lib/youtube"
import type { SubmissionMedia } from "@/lib/types"
import { signObjectUrl } from "@/lib/storage/client"
import { cn } from "@/lib/utils"
import { GeoMapLinks } from "@/components/location/geo-map-links"
import { ProofWatermark } from "@/components/submissions/proof-watermark"

interface MediaGalleryProps {
  media: SubmissionMedia[]
  className?: string
}

interface MediaItem extends SubmissionMedia {
  signedUrl?: string
}

export function MediaGallery({ media, className }: MediaGalleryProps) {
  const [items, setItems] = useState<MediaItem[]>(media)

  const loadSignedUrls = useCallback(async () => {
    const enriched = await Promise.all(
      media.map(async (item) => {
        if (item.file_path && (item.media_type === "image" || item.media_type === "video")) {
          const signedUrl =
            (await signObjectUrl({
              bucket: "submissions",
              path: item.file_path,
            })) ?? undefined
          return { ...item, signedUrl }
        }
        return item
      })
    )
    setItems(enriched)
  }, [media])

  useEffect(() => {
    loadSignedUrls()
  }, [loadSignedUrls])

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[color:var(--white,#f5f5f5)]/40">
        No media attached.
      </p>
    )
  }

  return (
    <div
      className={cn(
        "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {items.map((item) => {
        if (item.media_type === "video" && item.youtube_url) {
          const embedUrl = getYouTubeEmbedUrl(item.youtube_url)
          if (!embedUrl) return null

          return (
            <div
              key={item.id}
              className="col-span-full overflow-hidden rounded-xl border border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]"
            >
              <div className="relative aspect-video w-full">
                <iframe
                  src={embedUrl}
                  title="YouTube video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 size-full"
                />
              </div>
            </div>
          )
        }

        if (item.media_type === "video" && item.signedUrl) {
          return (
            <div
              key={item.id}
              className="col-span-full overflow-hidden rounded-xl border border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]"
            >
              <video
                src={item.signedUrl}
                controls
                playsInline
                className="aspect-video w-full"
              />
            </div>
          )
        }

        if (item.media_type === "image" && item.signedUrl) {
          return (
            <div
              key={item.id}
              className="space-y-2"
            >
              <div className="group relative aspect-square overflow-hidden rounded-xl border border-[color:var(--gold,#d4af37)]/15 bg-[color:var(--black,#0a0a0a)]">
                <Image
                  src={item.signedUrl}
                  alt="Submission image"
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, 33vw"
                  unoptimized
                />
                <ProofWatermark />
              </div>
              <GeoMapLinks
                latitude={item.latitude}
                longitude={item.longitude}
                accuracy_m={item.accuracy_m}
                location_source={item.location_source}
              />
            </div>
          )
        }

        return null
      })}
    </div>
  )
}

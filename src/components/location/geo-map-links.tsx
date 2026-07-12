"use client";

import { MapPin } from "lucide-react";
import {
  appleMapsUrl,
  formatAccuracy,
  formatCoords,
  googleMapsUrl,
} from "@/lib/location";
import { cn } from "@/lib/utils";

type Props = {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  accuracy_m?: number | null;
  location_source?: string | null;
  className?: string;
};

export function GeoMapLinks({
  latitude,
  longitude,
  accuracy_m,
  location_source,
  className,
}: Props) {
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-xs text-muted-foreground",
        className
      )}
    >
      <MapPin className="size-3.5 shrink-0 text-gold" />
      <span>
        {formatCoords(latitude, longitude)}
        {formatAccuracy(accuracy_m) ? ` · ${formatAccuracy(accuracy_m)}` : ""}
        {location_source ? ` · ${location_source}` : ""}
      </span>
      <a
        href={appleMapsUrl(latitude, longitude)}
        target="_blank"
        rel="noreferrer"
        className="text-gold hover:underline"
      >
        Apple Maps
      </a>
      <a
        href={googleMapsUrl(latitude, longitude)}
        target="_blank"
        rel="noreferrer"
        className="text-gold hover:underline"
      >
        Google Maps
      </a>
    </div>
  );
}

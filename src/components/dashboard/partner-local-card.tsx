"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  Sun,
} from "lucide-react";
import { PARTNER_PLACES, type PartnerPlaceId } from "@/lib/partner-locations";
import {
  formatClockInZone,
  formatDateLineInZone,
} from "@/lib/timezone";
import {
  formatTemperature,
  type WeatherSnapshot,
} from "@/lib/weather";
import { cn } from "@/lib/utils";

function WeatherIcon({
  code,
  className,
}: {
  code: number | null;
  className?: string;
}) {
  if (code == null) return <Cloud className={className} />;
  if (code === 0 || code === 1) return <Sun className={className} />;
  if (code === 2) return <CloudSun className={className} />;
  if (code === 3) return <Cloud className={className} />;
  if (code === 45 || code === 48) return <CloudFog className={className} />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return <CloudRain className={className} />;
  }
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    return <CloudSnow className={className} />;
  }
  if (code >= 95) return <CloudLightning className={className} />;
  return <Cloud className={className} />;
}

type PartnerLocalCardProps = {
  /** Whose local time/weather to show (the other person). */
  placeId: PartnerPlaceId;
  className?: string;
};

/** Live partner clock + weather for the opposite person's city. */
export function PartnerLocalCard({
  placeId,
  className,
}: PartnerLocalCardProps) {
  const place = PARTNER_PLACES[placeId];
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [weatherError, setWeatherError] = useState(false);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/weather?place=${placeId}`);
        if (!res.ok) throw new Error("weather failed");
        const data = (await res.json()) as WeatherSnapshot;
        if (!cancelled) {
          setWeather(data);
          setWeatherError(false);
        }
      } catch {
        if (!cancelled) setWeatherError(true);
      }
    };
    void load();
    const refresh = window.setInterval(() => void load(), 10 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [placeId]);

  const clock = formatClockInZone(now, place.timeZone);
  const dateLine = formatDateLineInZone(now, place.timeZone);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border border-gold/15 bg-charcoal/70 px-4 py-3",
        className
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-void/40 text-gold">
        {weather ? (
          <WeatherIcon code={weather.weatherCode} className="h-5 w-5" />
        ) : weatherError ? (
          <Cloud className="h-5 w-5 opacity-40" />
        ) : (
          <Loader2 className="h-4 w-4 animate-spin opacity-60" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {place.label}&apos;s local · {place.city}
        </p>
        <p className="font-heading text-xl text-ivory">
          {clock}
          <span className="ml-1.5 text-xs font-sans text-muted-foreground">
            {place.zoneShort}
          </span>
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {dateLine}
          {weather
            ? ` · ${formatTemperature(weather.temperature, weather.unit)} · ${weather.label}`
            : weatherError
              ? " · Weather unavailable"
              : ""}
        </p>
      </div>
    </div>
  );
}

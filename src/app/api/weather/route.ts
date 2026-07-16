import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PARTNER_PLACES, type PartnerPlaceId } from "@/lib/partner-locations";
import { weatherLabel, type WeatherSnapshot } from "@/lib/weather";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const placeId = new URL(request.url).searchParams.get("place") as
    | PartnerPlaceId
    | null;
  if (!placeId || !(placeId in PARTNER_PLACES)) {
    return NextResponse.json(
      { error: "place must be queen or slave" },
      { status: 400 }
    );
  }

  const place = PARTNER_PLACES[placeId];
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,weather_code",
    temperature_unit:
      place.tempUnit === "fahrenheit" ? "fahrenheit" : "celsius",
    timezone: place.timeZone,
  });

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
      { next: { revalidate: 600 } }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "Weather upstream failed" },
        { status: 502 }
      );
    }
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const temp = data.current?.temperature_2m;
    const code = data.current?.weather_code;
    if (typeof temp !== "number" || typeof code !== "number") {
      return NextResponse.json(
        { error: "Weather payload incomplete" },
        { status: 502 }
      );
    }

    const snapshot: WeatherSnapshot = {
      temperature: temp,
      unit: place.tempUnit,
      weatherCode: code,
      label: weatherLabel(code),
      fetchedAt: new Date().toISOString(),
    };
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json({ error: "Weather fetch failed" }, { status: 502 });
  }
}

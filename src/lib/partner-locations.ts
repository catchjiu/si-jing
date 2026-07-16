/** Fixed home bases for the two users (no per-profile TZ field yet). */

export type PartnerPlaceId = "queen" | "slave";

export type PartnerPlace = {
  id: PartnerPlaceId;
  label: string;
  city: string;
  region: string;
  timeZone: string;
  latitude: number;
  longitude: number;
  /** Preferred temperature unit for that place. */
  tempUnit: "fahrenheit" | "celsius";
  /** Short zone label, e.g. PT / Taipei */
  zoneShort: string;
};

export const QUEEN_PLACE: PartnerPlace = {
  id: "queen",
  label: "Queen",
  city: "Santa Cruz",
  region: "California",
  timeZone: "America/Los_Angeles",
  latitude: 36.9741,
  longitude: -122.0308,
  tempUnit: "celsius",
  zoneShort: "PT",
};

export const SLAVE_PLACE: PartnerPlace = {
  id: "slave",
  label: "D",
  city: "Kaohsiung",
  region: "Taiwan",
  timeZone: "Asia/Taipei",
  latitude: 22.6273,
  longitude: 120.3014,
  tempUnit: "celsius",
  zoneShort: "Taipei",
};

export const PARTNER_PLACES: Record<PartnerPlaceId, PartnerPlace> = {
  queen: QUEEN_PLACE,
  slave: SLAVE_PLACE,
};

/** Queen always edits work hours in California time. */
export const QUEEN_WORK_TIMEZONE = QUEEN_PLACE.timeZone;

export function partnerPlaceForViewer(role: "queen" | "slave"): PartnerPlace {
  return role === "queen" ? SLAVE_PLACE : QUEEN_PLACE;
}

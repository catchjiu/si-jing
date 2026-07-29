/** Fallback when the live USD→TWD rate cannot be fetched. */
export const USD_TO_NTD_FALLBACK = 32.5;

const RATE_CACHE_MS = 60 * 60 * 1000;

let cachedRate: { rate: number; fetchedAt: number } | null = null;

export function convertUsdToNtd(usd: number, rate: number): number {
  return Math.round(usd * rate * 100) / 100;
}

export async function getUsdToNtdRate(): Promise<number> {
  if (cachedRate && Date.now() - cachedRate.fetchedAt < RATE_CACHE_MS) {
    return cachedRate.rate;
  }

  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error("Rate fetch failed");
    const data = (await res.json()) as { rates?: { TWD?: number } };
    const rate = data.rates?.TWD;
    if (!rate || !Number.isFinite(rate) || rate <= 0) {
      throw new Error("Invalid rate");
    }
    cachedRate = { rate, fetchedAt: Date.now() };
    return rate;
  } catch {
    return USD_TO_NTD_FALLBACK;
  }
}

import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export type AttentionBudget = {
  enabled: boolean;
  daily_message_limit: number;
  daily_request_limit: number;
  speak_freely_tokens: number;
  messages_sent: number;
  requests_sent: number;
  messages_remaining: number;
  requests_remaining: number;
  usage_date: string;
};

export type AttentionBudgetSettings = {
  enabled: boolean;
  daily_message_limit: number;
  daily_request_limit: number;
  speak_freely_tokens: number;
};

const DEFAULT_SETTINGS: AttentionBudgetSettings = {
  enabled: true,
  daily_message_limit: 10,
  daily_request_limit: 3,
  speak_freely_tokens: 0,
};

export async function fetchAttentionBudget(
  supabase: Supabase
): Promise<AttentionBudget | null> {
  const { data, error } = await supabase.rpc("get_attention_budget");
  if (error) {
    console.error("get_attention_budget", error);
    return null;
  }
  const raw = data as Record<string, unknown> | null;
  if (!raw) return null;
  return {
    enabled: Boolean(raw.enabled),
    daily_message_limit: Number(raw.daily_message_limit ?? 10),
    daily_request_limit: Number(raw.daily_request_limit ?? 3),
    speak_freely_tokens: Number(raw.speak_freely_tokens ?? 0),
    messages_sent: Number(raw.messages_sent ?? 0),
    requests_sent: Number(raw.requests_sent ?? 0),
    messages_remaining: Number(raw.messages_remaining ?? 0),
    requests_remaining: Number(raw.requests_remaining ?? 0),
    usage_date: String(raw.usage_date ?? ""),
  };
}

export async function consumeAttention(
  supabase: Supabase,
  kind: "message" | "request"
): Promise<{ ok: boolean; error?: string; used_token?: boolean }> {
  const { data, error } = await supabase.rpc("consume_attention", {
    p_kind: kind,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  const raw = data as Record<string, unknown> | null;
  if (!raw) return { ok: true };
  if (raw.ok === false) {
    return { ok: false, error: String(raw.error ?? "Attention limit reached") };
  }
  return {
    ok: true,
    used_token: Boolean(raw.used_token),
  };
}

export async function loadAttentionSettings(
  supabase: Supabase
): Promise<AttentionBudgetSettings> {
  const { data } = await supabase
    .from("pair_settings")
    .select("value")
    .eq("key", "attention_budget")
    .maybeSingle();
  const value = (data?.value ?? {}) as Record<string, unknown>;
  return {
    enabled: value.enabled !== false,
    daily_message_limit: Number(
      value.daily_message_limit ?? DEFAULT_SETTINGS.daily_message_limit
    ),
    daily_request_limit: Number(
      value.daily_request_limit ?? DEFAULT_SETTINGS.daily_request_limit
    ),
    speak_freely_tokens: Number(value.speak_freely_tokens ?? 0),
  };
}

export async function saveAttentionSettings(
  supabase: Supabase,
  settings: AttentionBudgetSettings,
  updatedBy: string
): Promise<{ error?: string }> {
  const { error } = await supabase.from("pair_settings").upsert({
    key: "attention_budget",
    value: settings,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  });
  return error ? { error: error.message } : {};
}

export async function grantSpeakFreelyTokens(
  supabase: Supabase,
  count = 1
): Promise<{ tokens?: number; error?: string }> {
  const { data, error } = await supabase.rpc("grant_speak_freely_tokens", {
    p_count: count,
  });
  if (error) return { error: error.message };
  return { tokens: Number(data ?? 0) };
}

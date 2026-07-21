import type { createClient } from "@/lib/supabase/client";

type Supabase = ReturnType<typeof createClient>;

export type DenialLedger = {
  edges_remaining: number;
  denial_ends_at: string | null;
  queen_note: string | null;
  updated_at: string | null;
  balance_clear: boolean;
  can_request_orgasm: boolean;
};

export type EdgeLog = {
  id: string;
  logged_by: string;
  image_path: string;
  note: string | null;
  created_at: string;
  signedUrl?: string;
};

function normalizeLedger(raw: Record<string, unknown> | null): DenialLedger {
  return {
    edges_remaining: Math.max(0, Number(raw?.edges_remaining ?? 0) || 0),
    denial_ends_at: (raw?.denial_ends_at as string | null) ?? null,
    queen_note: (raw?.queen_note as string | null) ?? null,
    updated_at: (raw?.updated_at as string | null) ?? null,
    balance_clear: Boolean(raw?.balance_clear),
    can_request_orgasm: Boolean(raw?.can_request_orgasm),
  };
}

export async function fetchDenialLedger(
  supabase: Supabase
): Promise<DenialLedger> {
  const { data, error } = await supabase.rpc("get_denial_ledger");
  if (error) throw error;
  return normalizeLedger((data ?? {}) as Record<string, unknown>);
}

export async function queenAddEdgeDebt(
  supabase: Supabase,
  edges: number,
  note?: string | null
): Promise<DenialLedger> {
  const { data, error } = await supabase.rpc("queen_add_edge_debt", {
    p_edges: edges,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  return normalizeLedger((data ?? {}) as Record<string, unknown>);
}

export async function queenAddDenialDays(
  supabase: Supabase,
  days: number,
  note?: string | null
): Promise<DenialLedger> {
  const { data, error } = await supabase.rpc("queen_add_denial_days", {
    p_days: days,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  return normalizeLedger((data ?? {}) as Record<string, unknown>);
}

export async function queenClearDenialLedger(
  supabase: Supabase,
  options?: { clearEdges?: boolean; clearDays?: boolean }
): Promise<DenialLedger> {
  const { data, error } = await supabase.rpc("queen_clear_denial_ledger", {
    p_clear_edges: options?.clearEdges ?? true,
    p_clear_days: options?.clearDays ?? true,
  });
  if (error) throw error;
  return normalizeLedger((data ?? {}) as Record<string, unknown>);
}

export async function queenSetDenialNote(
  supabase: Supabase,
  note: string | null
): Promise<DenialLedger> {
  const { data, error } = await supabase.rpc("queen_set_denial_note", {
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  return normalizeLedger((data ?? {}) as Record<string, unknown>);
}

export type EdgeLogComment = {
  id: string;
  edge_log_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author?: { id: string; username: string; role: string } | null;
};

export async function fetchEdgeLogComments(
  supabase: Supabase,
  edgeLogId: string
): Promise<EdgeLogComment[]> {
  const { data, error } = await supabase
    .from("edge_log_comments")
    .select("id, edge_log_id, author_id, content, created_at, author:users!author_id(id, username, role)")
    .eq("edge_log_id", edgeLogId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as EdgeLogComment[];
}

export async function addEdgeLogComment(
  supabase: Supabase,
  edgeLogId: string,
  content: string
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data, error } = await supabase
    .from("edge_log_comments")
    .insert({
      edge_log_id: edgeLogId,
      author_id: user.id,
      content,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function slaveLogEdge(
  supabase: Supabase,
  imagePath: string,
  note?: string | null
): Promise<{ logId: string; ledger: DenialLedger }> {
  const { data, error } = await supabase.rpc("slave_log_edge", {
    p_image_path: imagePath,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  const row = (data ?? {}) as {
    log_id?: string;
    ledger?: Record<string, unknown>;
  };
  return {
    logId: String(row.log_id ?? ""),
    ledger: normalizeLedger(row.ledger ?? null),
  };
}

export async function fetchEdgeLogs(
  supabase: Supabase,
  limit = 30
): Promise<EdgeLog[]> {
  const { data, error } = await supabase
    .from("edge_logs")
    .select("id, logged_by, image_path, note, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as EdgeLog[];
}

export function denialDaysRemaining(
  endsAt: string | null | undefined,
  now = Date.now()
): number {
  if (!endsAt) return 0;
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function formatDenialBlockReason(ledger: DenialLedger): string {
  const parts: string[] = [];
  if (ledger.edges_remaining > 0) {
    parts.push(
      `${ledger.edges_remaining} edge${ledger.edges_remaining === 1 ? "" : "s"} remaining`
    );
  }
  const days = denialDaysRemaining(ledger.denial_ends_at);
  if (days > 0) {
    parts.push(
      `${days} denial day${days === 1 ? "" : "s"} left`
    );
  }
  if (parts.length === 0) return "Denial ledger is clear";
  return `Orgasm permission locked — ${parts.join(" · ")}`;
}

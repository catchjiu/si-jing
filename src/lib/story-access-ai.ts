import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import { NextResponse } from "next/server";

export type StoryAuthor = {
  id: string;
  role: UserRole;
  homeRole: UserRole;
};

/**
 * AI writing (prompt / rewrite / extend) is tied to permanent home_role=slave,
 * so the original slave keeps it as King and a switched Queen never gets it.
 */
export async function requireHomeSlaveWriter(): Promise<
  { error: NextResponse } | { author: StoryAuthor }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: me } = await supabase
    .from("users")
    .select("role, home_role")
    .eq("id", user.id)
    .single();

  const role = me?.role === "queen" ? "queen" : me?.role === "slave" ? "slave" : null;
  const homeRole =
    me?.home_role === "queen" || me?.home_role === "slave"
      ? me.home_role
      : role;

  if (!role || !homeRole) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  if (homeRole !== "slave") {
    return {
      error: NextResponse.json(
        { error: "Only the original slave can use AI writing" },
        { status: 403 }
      ),
    };
  }

  return {
    author: {
      id: user.id,
      role,
      homeRole,
    },
  };
}

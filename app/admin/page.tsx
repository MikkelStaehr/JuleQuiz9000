import type { Metadata } from "next";
import { Suspense } from "react";
import { isAdmin } from "@/lib/admin-auth";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { QUIZ } from "@/lib/quiz";
import type { Game, TeamWithCode } from "@/lib/types";
import { AdminPanel } from "./AdminPanel";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Quizmaster · UBS Christmas Quiz 2026" };

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-cream/50">Indlæser…</p>}>
      <AdminGate />
    </Suspense>
  );
}

/** Reads the admin cookie at request time (must sit behind Suspense with Cache Components). */
async function AdminGate() {
  if (!(await isAdmin())) return <LoginForm />;

  const sb = getAdminSupabase();
  const { data: game } = await sb
    .from("games")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let codes: TeamWithCode[] = [];
  if (game) {
    const { data } = await sb
      .from("teams")
      .select("id, game_id, slot, name, joined_at, is_demo, join_code")
      .eq("game_id", game.id)
      .order("slot");
    codes = (data as TeamWithCode[]) ?? [];
  }

  // Full quiz incl. answers is only ever sent to an authenticated quizmaster.
  return <AdminPanel quiz={QUIZ} initialGame={(game as Game) ?? null} teamCodes={codes} />;
}

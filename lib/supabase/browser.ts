"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Single browser client (anon / publishable key). Session persists in localStorage. */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Mangler NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY – se .env.example");
  }
  client = createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "xmasquiz-auth" },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return client;
}

export function publicImageUrl(path: string, version?: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const v = version ? `?v=${encodeURIComponent(version)}` : "";
  return `${base}/storage/v1/object/public/answers/${path}${v}`;
}

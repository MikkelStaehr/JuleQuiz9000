import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "xmasquiz_admin";

function expectedToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return null;
  // Token is derived from the password: changing ADMIN_PASSWORD logs everyone out.
  return createHmac("sha256", pw).update("ubs-christmas-quiz-admin-v1").digest("hex");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  return safeEqual(input, pw);
}

export function adminToken(): string {
  const t = expectedToken();
  if (!t) throw new Error("ADMIN_PASSWORD er ikke sat");
  return t;
}

export async function isAdmin(): Promise<boolean> {
  const t = expectedToken();
  if (!t) return false;
  const c = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!c && safeEqual(c, t);
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Ikke logget ind som quizmaster");
}

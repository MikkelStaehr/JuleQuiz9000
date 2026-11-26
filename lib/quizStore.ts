import "server-only";
import seed from "@/data/quiz.json";
import { getAdminSupabase } from "./supabase/admin";

/**
 * The quiz (incl. facit) lives in a PRIVATE Storage bucket "quiz" → quiz.json (+ history/ backups).
 * Media for questions goes to the PUBLIC bucket "media". Both buckets are created on demand,
 * so no SQL migration is needed. data/quiz.json is only the initial seed.
 */
const QUIZ_BUCKET = "quiz";
const MEDIA_BUCKET = "media";
const FILE = "quiz.json";

let bucketsReady: Promise<void> | null = null;
export function ensureBuckets(): Promise<void> {
  bucketsReady ??= (async () => {
    const sb = getAdminSupabase();
    const { data } = await sb.storage.listBuckets();
    const have = new Set((data ?? []).map((b) => b.id));
    if (!have.has(QUIZ_BUCKET)) {
      const { error } = await sb.storage.createBucket(QUIZ_BUCKET, { public: false });
      if (error && !/exists/i.test(error.message)) throw new Error(`Kunne ikke oprette bucket "quiz": ${error.message}`);
    }
    if (!have.has(MEDIA_BUCKET)) {
      const { error } = await sb.storage.createBucket(MEDIA_BUCKET, {
        public: true,
        fileSizeLimit: "50MB",
        allowedMimeTypes: ["image/*", "audio/*", "video/*"],
      });
      if (error && !/exists/i.test(error.message)) throw new Error(`Kunne ikke oprette bucket "media": ${error.message}`);
    }
  })().catch((e) => {
    bucketsReady = null;
    throw e;
  });
  return bucketsReady;
}

/** Raw quiz content (same shape as data/quiz.json). Seeds from data/quiz.json the first time. */
export async function readQuizContent(): Promise<unknown> {
  await ensureBuckets();
  const sb = getAdminSupabase();
  // Seed ONLY if the file really doesn't exist – never overwrite the quiz because of a transient error.
  const { data: list, error: listErr } = await sb.storage.from(QUIZ_BUCKET).list("", { search: FILE });
  if (listErr) throw new Error(`Kunne ikke læse quizzen: ${listErr.message}`);
  if (!(list ?? []).some((f) => f.name === FILE)) {
    await writeQuizContent(seed, false);
    return seed;
  }
  const { data, error } = await sb.storage.from(QUIZ_BUCKET).download(FILE);
  if (error || !data) throw new Error(`Kunne ikke læse quizzen: ${error?.message ?? "ukendt fejl"}`);
  return JSON.parse(await data.text());
}

/** Write the quiz (caller validates first). Keeps a timestamped backup in history/. */
export async function writeQuizContent(content: unknown, backup = true): Promise<void> {
  await ensureBuckets();
  const sb = getAdminSupabase();
  const body = new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
  const { error } = await sb.storage.from(QUIZ_BUCKET).upload(FILE, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw new Error(`Kunne ikke gemme quizzen: ${error.message}`);
  if (backup) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await sb.storage.from(QUIZ_BUCKET).upload(`history/${stamp}.json`, body, { contentType: "application/json" });
  }
}

/** Signed upload URL for a media file (the browser uploads directly – no size limit on server actions). */
export async function createMediaUploadUrl(fileName: string) {
  await ensureBuckets();
  const sb = getAdminSupabase();
  const ext = (fileName.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? "").toLowerCase();
  const base = fileName
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .normalize("NFKD")
    .replace(/[^\w-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase();
  const path = `${Date.now().toString(36)}-${base || "fil"}${ext}`;
  const { data, error } = await sb.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Upload kunne ikke startes: ${error?.message}`);
  const { data: pub } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return { bucket: MEDIA_BUCKET, path, token: data.token, publicUrl: pub.publicUrl };
}

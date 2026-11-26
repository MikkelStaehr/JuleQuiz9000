import type { Metadata } from "next";
import { Suspense } from "react";
import { isAdmin } from "@/lib/admin-auth";
import { readQuizContent } from "@/lib/quizStore";
import { LoginForm } from "../LoginForm";
import { QuizEditor } from "./QuizEditor";

export const metadata: Metadata = { title: "Rediger quiz · Den kæmpe store elite jule quiz" };

export default function QuizEditorPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-cream/50">Indlæser…</p>}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  if (!(await isAdmin())) return <LoginForm />;
  const content = await readQuizContent();
  return <QuizEditor initial={content} />;
}

"use client";

import { useActionState } from "react";
import { Wordmark } from "@/components/Brand";
import { login } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, null);
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <form action={action} className="card-dark animate-fade-up w-full max-w-sm space-y-5 p-8">
        <Wordmark size="sm" />
        <div className="hairline" />
        <h1 className="text-center font-display text-3xl font-semibold">Quizmaster</h1>
        <input
          name="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          placeholder="Password"
          className="field"
          required
        />
        {state?.error && <p className="text-sm text-[#ffb4b6]">{state.error}</p>}
        <button className="btn btn-gold w-full py-3" disabled={pending}>
          {pending ? "Logger ind…" : "Log ind"}
        </button>
      </form>
    </main>
  );
}

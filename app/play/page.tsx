import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayClient } from "./PlayClient";

export const metadata: Metadata = { title: "Hold · UBS Christmas Quiz 2026" };

export default function PlayPage() {
  return (
    <Suspense>
      <PlayClient />
    </Suspense>
  );
}

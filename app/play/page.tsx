import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayClient } from "./PlayClient";

export const metadata: Metadata = { title: "Hold · Den kæmpe store elite jule quiz" };

export default function PlayPage() {
  return (
    <Suspense>
      <PlayClient />
    </Suspense>
  );
}

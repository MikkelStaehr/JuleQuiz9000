import type { Metadata } from "next";
import { DisplayClient } from "./DisplayClient";

export const metadata: Metadata = { title: "Storskærm · UBS Christmas Quiz 2026" };

export default function DisplayPage() {
  return <DisplayClient />;
}

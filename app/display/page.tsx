import type { Metadata } from "next";
import { DisplayClient } from "./DisplayClient";

export const metadata: Metadata = { title: "Storskærm · Den kæmpe store elite jule quiz" };

export default function DisplayPage() {
  return <DisplayClient />;
}

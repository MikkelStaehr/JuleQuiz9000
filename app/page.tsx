import Link from "next/link";
import { Wordmark } from "@/components/Brand";

export default function Home() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="animate-fade-up w-full max-w-md space-y-8 text-center">
        <Wordmark />
        <div className="hairline" />
        <Link href="/play" className="btn btn-gold w-full py-4 text-lg">
          Jeg er et hold – deltag
        </Link>
        <div className="flex justify-center gap-6 text-sm text-cream/50">
          <Link href="/display" className="hover:text-gold">Storskærm</Link>
          <Link href="/admin" className="hover:text-gold">Quizmaster</Link>
        </div>
      </div>
    </main>
  );
}

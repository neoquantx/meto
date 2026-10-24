import Link from "next/link";
import { cn } from "cn";
import { TryItButton } from "@/components/try-it-button";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24">
      <p className="text-sm font-medium text-muted-foreground">
        Meeting notes that keep their proof
      </p>
      <h1 className="mt-4 text-5xl font-semibold tracking-tight">Kept</h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
        Record a meeting from the browser. Every decision and promise stays
        tied to the words, and the moment, they were said.
      </p>
      <div className="mt-10 flex flex-wrap items-start gap-3">
        <TryItButton />
        <Link
          href="/demo"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          View demo
        </Link>
      </div>
    </main>
  );
}

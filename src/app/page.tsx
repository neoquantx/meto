import Link from "next/link";
import { cn } from "cn";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck2,
  Mic2,
  Quote,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { TryItButton } from "@/components/try-it-button";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-svh flex-1 flex-col overflow-hidden">
      <header className="relative z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex min-h-18 w-full max-w-7xl items-center px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <CheckCircle2 className="size-5" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold tracking-[-0.03em]">Kept</span>
          </Link>
          <Link
            href="/demo"
            className="ml-auto text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            See live demo
          </Link>
        </div>
      </header>

      <section className="relative mx-auto grid w-full max-w-7xl flex-1 items-center gap-14 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.02fr_0.98fr] lg:py-24">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Evidence-first meeting intelligence
          </div>
          <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-balance sm:text-6xl lg:text-7xl">
            Meeting notes that{" "}
            <span className="bg-gradient-to-r from-primary to-cyan-600 bg-clip-text text-transparent">
              follow through.
            </span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
            Record without a bot. Kept turns every decision and promise into a
            verified, timestamped record—then checks what happened in the next meeting.
          </p>
          <div className="mt-9 flex flex-col items-stretch gap-3 min-[420px]:flex-row min-[420px]:items-start">
            <TryItButton />
            <Link
              href="/demo"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "group")}
            >
              Explore the demo
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-emerald-600" aria-hidden="true" />
              Consent first
            </span>
            <span className="flex items-center gap-1.5">
              <Mic2 className="size-4 text-emerald-600" aria-hidden="true" />
              No meeting bot
            </span>
            <span className="flex items-center gap-1.5">
              <FileCheck2 className="size-4 text-emerald-600" aria-hidden="true" />
              Verbatim proof
            </span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -inset-10 -z-10 rounded-full bg-primary/10 blur-3xl" />
          <div className="surface overflow-hidden p-3 sm:p-4">
            <div className="rounded-xl bg-[linear-gradient(145deg,oklch(0.25_0.08_264),oklch(0.35_0.16_264))] p-5 text-white sm:p-7">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold tracking-[0.14em] text-white/60 uppercase">
                    Commitment ledger
                  </p>
                  <h2 className="mt-1 text-xl font-semibold">Launch planning</h2>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
                  3 meetings
                </span>
              </div>
              <div className="mt-7 space-y-3">
                <DemoRow status="Done" tone="emerald" owner="Rahul" text="Send the pricing deck" />
                <DemoRow status="Done" tone="emerald" owner="Himanshu" text="Fix the login bug" />
                <DemoRow status="Dropped" tone="amber" owner="Rahul" text="Book the demo room" />
              </div>
            </div>
            <div className="grid gap-3 p-2 pt-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border/70 bg-card p-4">
                <Quote className="size-4 text-primary" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium">Every item has proof</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Verbatim quotes link to the exact moment.
                </p>
              </div>
              <div className="rounded-xl border border-border/70 bg-card p-4">
                <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium">Promises stay visible</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Done, changed, or quietly dropped—automatically.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function DemoRow({
  status,
  tone,
  owner,
  text,
}: {
  status: string;
  tone: "emerald" | "amber";
  owner: string;
  text: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/8 p-3 backdrop-blur">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          tone === "emerald" ? "bg-emerald-400" : "bg-amber-400",
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{text}</p>
        <p className="mt-0.5 text-xs text-white/55">{owner}</p>
      </div>
      <span className="text-xs font-medium text-white/70">{status}</span>
    </div>
  );
}

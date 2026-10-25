import Link from "next/link";
import { CheckCircle2, Sparkles } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { SignOutButton } from "@/components/sign-out-button";
import { TryItButton } from "@/components/try-it-button";

export function AppShell({
  children,
  readOnly = false,
}: {
  children: React.ReactNode;
  readOnly?: boolean;
}) {
  return (
    <div className="flex min-h-svh flex-1 bg-transparent lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-svh border-r border-border/70 bg-card/75 p-4 backdrop-blur-xl lg:flex lg:flex-col">
        <Link
          href={readOnly ? "/demo" : "/meetings"}
          className="flex items-center gap-3 rounded-xl px-2 py-2"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <CheckCircle2 className="size-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-base font-semibold tracking-[-0.025em]">Kept</span>
            <span className="block text-[0.68rem] font-medium tracking-wide text-muted-foreground">
              MEETINGS, FOLLOWED THROUGH
            </span>
          </span>
        </Link>
        {readOnly ? (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Read-only demo
          </div>
        ) : null}
        <div className="mt-6">
          <AppNav readOnly={readOnly} />
        </div>
        <div className="mt-auto border-t border-border/70 pt-4">
          {readOnly ? <TryItButton size="default" /> : <SignOutButton />}
        </div>
      </aside>

      <div className="flex min-h-svh min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-background/88 backdrop-blur-xl lg:hidden">
          <div className="flex min-h-16 items-center gap-3 px-4">
          <Link
              href={readOnly ? "/demo" : "/meetings"}
              className="flex items-center gap-2.5"
          >
              <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <CheckCircle2 className="size-4.5" aria-hidden="true" />
              </span>
              <span className="font-semibold tracking-[-0.025em]">Kept</span>
          </Link>
            <div className="ml-auto flex items-center gap-2">
            {readOnly ? (
              <>
                  <span className="hidden rounded-full border border-primary/15 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary min-[370px]:inline-flex">
                    Demo
                </span>
                <TryItButton size="sm" />
              </>
            ) : (
              <SignOutButton />
            )}
          </div>
        </div>
      </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-28 sm:px-6 sm:py-9 lg:px-8 lg:py-10 lg:pb-12 xl:px-12">
        {children}
      </main>

        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_30px_oklch(0.2_0.04_264/0.08)] backdrop-blur-xl lg:hidden">
          <AppNav readOnly={readOnly} />
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
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
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-4 px-4 py-3 sm:px-6">
          <Link
            href={readOnly ? "/" : "/meetings"}
            className="text-sm font-semibold tracking-tight"
          >
            Kept
          </Link>
          <AppNav readOnly={readOnly} />
          <div className="ml-auto flex items-center gap-3">
            {readOnly ? (
              <>
                <span className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground">
                  Read-only demo
                </span>
                <TryItButton size="sm" />
              </>
            ) : (
              <SignOutButton />
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </div>
  );
}

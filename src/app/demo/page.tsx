import Link from "next/link";

export default function DemoPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Demo</h1>
      <p className="mt-4 max-w-lg text-muted-foreground">
        The read-only demo meetings are added in the last step, once the
        ledger has something real to show.
      </p>
      <Link href="/" className="mt-8 text-sm underline underline-offset-4">
        Back
      </Link>
    </main>
  );
}

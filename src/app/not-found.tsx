import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-4 max-w-lg text-muted-foreground">
        That meeting or link does not exist.
      </p>
      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link href="/" className="underline underline-offset-4">
          Home
        </Link>
        <Link href="/demo" className="underline underline-offset-4">
          View demo
        </Link>
      </div>
    </main>
  );
}

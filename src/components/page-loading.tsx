function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-muted ${className}`} />;
}

export function PageLoading({ demo = false }: { demo?: boolean }) {
  return (
    <section aria-busy="true" aria-live="polite">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-3 h-10 w-64 max-w-full" />
      <Skeleton className="mt-3 h-5 w-full max-w-2xl" />
      {demo ? (
        <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-40 lg:col-span-2" />
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      )}
    </section>
  );
}

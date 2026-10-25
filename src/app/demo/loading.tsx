export default function DemoLoading() {
  return (
    <section aria-busy="true" aria-live="polite">
      <p className="text-sm text-muted-foreground">Loading demo…</p>
    </section>
  );
}

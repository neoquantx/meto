import { ShareFrame } from "@/components/share-document";

export default function ShareLoading() {
  return (
    <ShareFrame>
      <p className="text-sm text-muted-foreground" aria-busy="true" aria-live="polite">
        Loading shared notes…
      </p>
    </ShareFrame>
  );
}

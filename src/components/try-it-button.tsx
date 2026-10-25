"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

export function TryItButton({
  size = "lg",
}: {
  size?: "default" | "sm" | "lg";
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);

    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      setError("Supabase is not configured. Add the keys in .env.local.");
      setPending(false);
      return;
    }

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user) {
      router.push("/meetings");
      router.refresh();
      return;
    }

    const { error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError) {
      setError(signInError.message);
      setPending(false);
      return;
    }

    router.push("/meetings");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button size={size} onClick={signIn} disabled={pending}>
        {pending ? "Signing in…" : "Try it"}
      </Button>
      {error ? (
        <p className="max-w-sm text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

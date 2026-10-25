"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/browser";

const DRAFT_KEY = "kept:profile-draft";
const roles = [
  "Founder",
  "Product",
  "Engineering",
  "Design",
  "Sales",
  "Operations",
  "Other",
];

export function ProfileForm({
  initialName,
  initialRole,
}: {
  initialName: string;
  initialRole: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [role, setRole] = useState(initialRole);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as {
        name?: unknown;
        role?: unknown;
      } | null;
      const savedName = !initialName && typeof draft?.name === "string" ? draft.name : initialName;
      const savedRole = !initialRole && typeof draft?.role === "string" ? draft.role : initialRole;
      startTransition(() => {
        setName(savedName);
        setRole(savedRole);
      });
      hydrated.current = true;
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [initialName, initialRole]);

  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ name, role }));
  }, [name, role]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanRole = role.trim();
    if (!cleanName || !cleanRole) {
      setError("Enter your name and primary role.");
      return;
    }

    setPending(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      data: { full_name: cleanName, primary_role: cleanRole },
    });
    if (updateError) {
      setError(updateError.message);
      setPending(false);
      return;
    }

    localStorage.removeItem(DRAFT_KEY);
    router.push("/meetings");
    router.refresh();
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-12 sm:px-8">
      <section className="surface w-full max-w-lg p-6 sm:p-8">
        <span className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
          <CheckCircle2 className="size-5" aria-hidden="true" />
        </span>
        <p className="page-eyebrow mt-6">One quick step</p>
        <h1 className="page-title">Tell us about you</h1>
        <p className="page-description">
          This helps personalize your workspace. You can update it later.
        </p>
        <form className="mt-8 space-y-5" onSubmit={saveProfile}>
          <label className="block text-sm font-medium">
            Your name
            <input
              className="field mt-1.5"
              value={name}
              maxLength={100}
              autoComplete="name"
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium">
            Primary role
            <select
              className="field mt-1.5"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="" disabled>
                Select your role
              </option>
              {roles.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Saving…" : "Continue"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </section>
    </main>
  );
}

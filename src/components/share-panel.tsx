"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, ShieldCheck, UserRound, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ShareLink } from "@/lib/share-view";

async function errorMessage(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    return fallback;
  }
  return fallback;
}

export function SharePanel({
  meetingId,
  people,
  shares,
  activeMs,
}: {
  meetingId: string;
  people: { id: string; name: string }[];
  shares: ShareLink[];
  activeMs?: number | null;
}) {
  const router = useRouter();
  const [links, setLinks] = useState(shares);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function create(personId: string | null) {
    const key = personId ?? "meeting";
    setBusy(key);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/shares`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ person_id: personId }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        token?: string;
        personId?: string | null;
        personName?: string | null;
      } | null;
      if (!response.ok || !payload?.token) {
        setError(payload?.error ?? "Could not create the share link.");
        setBusy(null);
        return;
      }
      const link: ShareLink = {
        token: payload.token,
        personId: payload.personId ?? null,
        personName: payload.personName ?? null,
      };
      setLinks((current) => (current.some((item) => item.token === link.token) ? current : [...current, link]));
      setNotice(await copyLink(payload.token, activeMs));
      setBusy(null);
      router.refresh();
    } catch {
      setError("Could not create the share link.");
      setBusy(null);
    }
  }

  async function copy(token: string) {
    setNotice(null);
    setError(null);
    setNotice(await copyLink(token, activeMs));
  }

  async function revoke(token: string) {
    setBusy(`revoke:${token}`);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch(`/api/shares/${token}`, { method: "POST" });
      if (!response.ok) {
        setError(await errorMessage(response, "Could not revoke that link."));
        setBusy(null);
        return;
      }
      setLinks((current) => current.filter((item) => item.token !== token));
      setNotice("Link revoked.");
      setBusy(null);
      router.refresh();
    } catch {
      setError("Could not revoke that link.");
      setBusy(null);
    }
  }

  return (
    <section className="surface p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Link2 className="size-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold">Share safely</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Read-only links hide emails, phone numbers, and card numbers. Audio always stays private.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={busy !== null} onClick={() => void create(null)}>
          <UsersRound className="size-4" aria-hidden="true" />
          {busy === "meeting" ? "Sharing…" : "Share meeting"}
        </Button>
        {people.map((person) => (
          <Button
            key={person.id}
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void create(person.id)}
          >
            <UserRound className="size-4" aria-hidden="true" />
            {busy === person.id ? "Sharing…" : `Share ${person.name}`}
          </Button>
        ))}
      </div>
      {links.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {links.map((link) => (
            <li key={link.token} className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/35 p-3 text-sm">
              <span className="min-w-0 flex-1">
                {link.personName ? `Only ${link.personName}` : "Whole meeting"}
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">/share/{link.token}</span>
              </span>
              <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void copy(link.token)}>
                <Copy className="size-3.5" aria-hidden="true" />
                Copy link
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void revoke(link.token)}
              >
                <X className="size-3.5" aria-hidden="true" />
                {busy === `revoke:${link.token}` ? "Revoking…" : "Revoke"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {notice ? <p className="mt-3 flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck className="size-4" aria-hidden="true" />{notice}</p> : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

async function copyLink(token: string, activeMs?: number | null) {
  const currentQuery = new URLSearchParams(window.location.search).get("t");
  const fromQuery = currentQuery && /^\d+$/.test(currentQuery) ? Number(currentQuery) : null;
  const t = activeMs != null && activeMs > 0 ? Math.floor(activeMs) : fromQuery && fromQuery > 0 ? fromQuery : null;
  const suffix = t != null ? `?t=${t}` : "";
  const url = `${window.location.origin}/share/${token}${suffix}`;
  try {
    await navigator.clipboard.writeText(url);
    return "Link copied.";
  } catch {
    return url;
  }
}

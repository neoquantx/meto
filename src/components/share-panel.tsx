"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
}: {
  meetingId: string;
  people: { id: string; name: string }[];
  shares: ShareLink[];
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
      setNotice(await copyLink(payload.token));
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
    setNotice(await copyLink(token));
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
    <section>
      <h2 className="text-lg font-medium">Share</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A share link is read-only. Emails, phone numbers, and card numbers are hidden. The audio stays private.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" disabled={busy !== null} onClick={() => void create(null)}>
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
            {busy === person.id ? "Sharing…" : `Share ${person.name}`}
          </Button>
        ))}
      </div>
      {links.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {links.map((link) => (
            <li key={link.token} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-0 flex-1">
                {link.personName ? `Only ${link.personName}` : "Whole meeting"}
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">/share/{link.token}</span>
              </span>
              <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void copy(link.token)}>
                Copy link
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => void revoke(link.token)}
              >
                {busy === `revoke:${link.token}` ? "Revoking…" : "Revoke"}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {notice ? <p className="mt-2 text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
    </section>
  );
}

async function copyLink(token: string) {
  const url = `${window.location.origin}/share/${token}`;
  try {
    await navigator.clipboard.writeText(url);
    return "Link copied.";
  } catch {
    return url;
  }
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";

const appLinks = [
  ["/meetings", "Meetings"],
  ["/ledger", "Ledger"],
  ["/decisions", "Decisions"],
  ["/brief", "Brief"],
  ["/settings", "Settings"],
] as const;

const demoLinks = [
  ["/demo/meetings", "Meetings"],
  ["/demo/ledger", "Ledger"],
  ["/demo/decisions", "Decisions"],
  ["/demo/brief", "Brief"],
] as const;

export function AppNav({ readOnly = false }: { readOnly?: boolean }) {
  const pathname = usePathname();
  const links = readOnly ? demoLinks : appLinks;

  return (
    <nav className="flex flex-wrap items-center gap-1" aria-label={readOnly ? "Demo navigation" : "Main navigation"}>
      {links.map(([href, label]) => {
        const active =
          pathname === href ||
          pathname.startsWith(`${href}/`) ||
          (readOnly && href === "/demo/meetings" && pathname === "/demo");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

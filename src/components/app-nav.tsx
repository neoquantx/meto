"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "cn";
import {
  BookOpenText,
  CalendarClock,
  ListChecks,
  Settings,
  UsersRound,
} from "lucide-react";

const appLinks = [
  ["/meetings", "Meetings", CalendarClock],
  ["/ledger", "Ledger", ListChecks],
  ["/decisions", "Decisions", BookOpenText],
  ["/brief", "Brief", UsersRound],
  ["/settings", "Settings", Settings],
] as const;

const demoLinks = [
  ["/demo/meetings", "Meetings", CalendarClock],
  ["/demo/ledger", "Ledger", ListChecks],
  ["/demo/decisions", "Decisions", BookOpenText],
  ["/demo/brief", "Brief", UsersRound],
] as const;

export function AppNav({ readOnly = false }: { readOnly?: boolean }) {
  const pathname = usePathname();
  const links = readOnly ? demoLinks : appLinks;

  return (
    <nav
      className="flex w-full items-center justify-around gap-1 lg:flex-col lg:items-stretch lg:justify-start"
      aria-label={readOnly ? "Demo navigation" : "Main navigation"}
    >
      {links.map(([href, label, Icon]) => {
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
              "group flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-1.5 text-[0.68rem] font-medium transition-colors lg:min-h-11 lg:flex-none lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-4.5 transition-transform group-hover:scale-105 lg:size-4",
                active && "stroke-[2.25]",
              )}
              aria-hidden="true"
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

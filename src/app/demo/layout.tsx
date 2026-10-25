import { AppShell } from "@/components/app-shell";

export const dynamic = "force-dynamic";

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell readOnly>{children}</AppShell>;
}

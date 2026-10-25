import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    redirect("/");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");
  const metadata = user.user_metadata ?? {};
  const profileName = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
  const profileRole = typeof metadata.primary_role === "string" ? metadata.primary_role.trim() : "";
  if (!profileName || !profileRole) redirect("/profile");

  return <AppShell>{children}</AppShell>;
}

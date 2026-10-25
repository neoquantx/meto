import { redirect } from "next/navigation";
import { ProfileForm } from "@/components/profile-form";
import { createClient } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const metadata = user.user_metadata ?? {};
  const name = typeof metadata.full_name === "string" ? metadata.full_name : "";
  const role = typeof metadata.primary_role === "string" ? metadata.primary_role : "";

  if (name.trim() && role.trim()) redirect("/meetings");

  return <ProfileForm initialName={name} initialRole={role} />;
}

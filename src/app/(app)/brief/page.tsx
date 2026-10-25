import { BriefView } from "@/components/page-views";
import { getUserOrThrow } from "@/lib/supabase/server";

export default async function BriefPage() {
  const user = await getUserOrThrow();
  return <BriefView ownerId={user.id} />;
}

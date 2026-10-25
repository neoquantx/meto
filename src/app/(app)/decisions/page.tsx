import { DecisionsView } from "@/components/page-views";
import { getUserOrThrow } from "@/lib/supabase/server";

export default async function DecisionsPage() {
  const user = await getUserOrThrow();
  return <DecisionsView ownerId={user.id} />;
}

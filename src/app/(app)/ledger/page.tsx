import { LedgerView } from "@/components/page-views";
import { getUserOrThrow } from "@/lib/supabase/server";

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const query = await searchParams;
  const raw = Array.isArray(query.status) ? query.status[0] : query.status;
  const user = await getUserOrThrow();
  return <LedgerView ownerId={user.id} statusRaw={raw} />;
}

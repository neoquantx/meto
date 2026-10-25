import { MeetingsView } from "@/components/page-views";
import { getUserOrThrow } from "@/lib/supabase/server";

function firstQuery(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const user = await getUserOrThrow();
  return <MeetingsView ownerId={user.id} queryRaw={firstQuery(params.q)} />;
}

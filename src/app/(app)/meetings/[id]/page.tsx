import { MeetingDetailView } from "@/components/page-views";
import { getUserOrThrow } from "@/lib/supabase/server";

function firstQuery(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string | string[]; line?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const user = await getUserOrThrow();
  return (
    <MeetingDetailView
      id={id}
      ownerId={user.id}
      t={firstQuery(query.t)}
      line={firstQuery(query.line)}
    />
  );
}

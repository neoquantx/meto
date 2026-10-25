import { MeetingDetailView } from "@/components/page-views";
import { readDemoOwnerId } from "@/lib/demo";

function firstQuery(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DemoMeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string | string[]; line?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <MeetingDetailView
      id={id}
      ownerId={readDemoOwnerId()}
      t={firstQuery(query.t)}
      line={firstQuery(query.line)}
      readOnly
    />
  );
}

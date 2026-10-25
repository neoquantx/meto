import { MeetingsView } from "@/components/page-views";
import { readDemoOwnerId } from "@/lib/demo";

function firstQuery(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DemoMeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  return (
    <MeetingsView
      ownerId={readDemoOwnerId()}
      queryRaw={firstQuery(params.q)}
      readOnly
    />
  );
}

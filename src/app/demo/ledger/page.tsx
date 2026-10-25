import { LedgerView } from "@/components/page-views";
import { readDemoOwnerId } from "@/lib/demo";

export default async function DemoLedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string | string[] }>;
}) {
  const query = await searchParams;
  const raw = Array.isArray(query.status) ? query.status[0] : query.status;
  return <LedgerView ownerId={readDemoOwnerId()} statusRaw={raw} readOnly />;
}

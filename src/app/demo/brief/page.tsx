import { BriefView } from "@/components/page-views";
import { readDemoOwnerId } from "@/lib/demo";

export default function DemoBriefPage() {
  return <BriefView ownerId={readDemoOwnerId()} readOnly />;
}

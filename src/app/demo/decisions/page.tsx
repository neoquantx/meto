import { DecisionsView } from "@/components/page-views";
import { readDemoOwnerId } from "@/lib/demo";

export default function DemoDecisionsPage() {
  return <DecisionsView ownerId={readDemoOwnerId()} readOnly />;
}

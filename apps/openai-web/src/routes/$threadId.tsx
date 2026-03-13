import { ThreadId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";

import OfficeShell from "../components/OfficeShell";

function ThreadRouteView() {
  const threadId = Route.useParams({
    select: (params) => ThreadId.makeUnsafe(params.threadId),
  });

  return <OfficeShell focusThreadId={threadId} />;
}

export const Route = createFileRoute("/$threadId")({
  component: ThreadRouteView,
});

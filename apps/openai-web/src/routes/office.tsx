import { createFileRoute } from "@tanstack/react-router";

import OfficeShell from "../components/OfficeShell";

function OfficeRouteView() {
  return <OfficeShell detached />;
}

export const Route = createFileRoute("/office")({
  component: OfficeRouteView,
});

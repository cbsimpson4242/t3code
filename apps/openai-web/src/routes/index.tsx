import { createFileRoute } from "@tanstack/react-router";

import OfficeShell from "../components/OfficeShell";

function IndexRouteView() {
  return <OfficeShell />;
}

export const Route = createFileRoute("/")({
  component: IndexRouteView,
});

import { createFileRoute } from "@tanstack/react-router";
import { SidebarInset } from "~/components/ui/sidebar";
import SourceControlPanel from "~/components/SourceControlPanel";

function SourceControlRouteView() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <SourceControlPanel />
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/source-control")({
  component: SourceControlRouteView,
});

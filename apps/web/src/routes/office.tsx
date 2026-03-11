import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback } from "react";

import VirtualOffice from "../components/VirtualOffice";
import { Button } from "../components/ui/button";

function OfficeRouteView() {
  const handleThreadActivate = useCallback((threadId: string) => {
    if (window.desktopBridge) {
      void window.desktopBridge.openThreadInMainWindow(threadId);
      return;
    }
    window.location.hash = `#/${threadId}`;
  }, []);

  const handleReattach = useCallback(() => {
    if (window.desktopBridge) {
      void window.desktopBridge.closeOfficeWindow();
      return;
    }
    window.location.hash = "#/";
  }, []);

  return (
    <div className="relative h-screen min-h-0 overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end px-4 py-4">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/90 p-1.5 shadow-lg backdrop-blur-sm">
          <Button size="sm" variant="ghost" onClick={handleReattach}>
            <ArrowLeft className="size-4" />
            Reattach
          </Button>
        </div>
      </div>
      <VirtualOffice onOpenThreadInMainWindow={handleThreadActivate} />
    </div>
  );
}

export const Route = createFileRoute("/office")({
  component: OfficeRouteView,
});

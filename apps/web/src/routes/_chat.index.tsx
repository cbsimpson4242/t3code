import { createFileRoute } from "@tanstack/react-router";

import { isElectron } from "../env";
import { SidebarTrigger } from "../components/ui/sidebar";
import VirtualOffice from "../components/VirtualOffice";

function ChatIndexRouteView() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-muted-foreground/40 overflow-hidden relative">
      {!isElectron && (
        <header className="absolute top-0 left-0 w-full z-10 border-b border-border/50 bg-background/80 backdrop-blur-sm px-3 py-2 md:hidden">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="size-7 shrink-0" />
            <span className="text-sm font-medium text-foreground">Threads</span>
          </div>
        </header>
      )}

      {isElectron && (
        <div className="drag-region absolute top-0 left-0 w-full z-10 flex h-[52px] shrink-0 items-center border-b border-border/50 bg-background/80 backdrop-blur-sm px-5">
          <span className="text-xs text-muted-foreground/50">T3 Office Dashboard</span>
        </div>
      )}

      <div className="flex flex-1 w-full h-full items-center justify-center pt-[52px]">
        <VirtualOffice />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_chat/")({
  component: ChatIndexRouteView,
});

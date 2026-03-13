import { ArrowLeft } from "lucide-react";
import type { ThreadId } from "@t3tools/contracts";

import OfficePane from "@legacy/components/OfficePane";
import VirtualOffice from "@legacy/components/VirtualOffice";
import { Button } from "@legacy/components/ui/button";

interface OfficeShellProps {
  focusThreadId?: ThreadId | null;
  detached?: boolean;
}

export default function OfficeShell({
  focusThreadId = null,
  detached = false,
}: OfficeShellProps) {
  if (!detached) {
    return (
      <div className="h-screen min-h-0 overflow-hidden bg-background text-foreground">
        <OfficePane focusThreadId={focusThreadId} />
      </div>
    );
  }

  return (
    <div className="relative h-screen min-h-0 overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end px-4 py-4">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/90 p-1.5 shadow-lg backdrop-blur-sm">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (window.desktopBridge) {
                void window.desktopBridge.closeOfficeWindow();
                return;
              }
              window.location.hash = "#/";
            }}
          >
            <ArrowLeft className="size-4" />
            Reattach
          </Button>
        </div>
      </div>
      <VirtualOffice
        focusThreadId={focusThreadId}
        onOpenThreadInMainWindow={(threadId) => {
          if (window.desktopBridge) {
            void window.desktopBridge.openThreadInMainWindow(threadId);
            return;
          }
          window.location.hash = `#/${threadId}`;
        }}
      />
    </div>
  );
}

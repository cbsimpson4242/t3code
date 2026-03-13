import { ArrowUpRight, PanelsTopLeft } from "lucide-react";
import type { ThreadId } from "@t3tools/contracts";

import { isElectron } from "../env";
import { useOfficeWindowState } from "../hooks/useOfficeWindowState";
import { Button } from "./ui/button";
import VirtualOffice from "./VirtualOffice";

export default function OfficePane(props: { focusThreadId?: ThreadId | null }) {
  const { isOfficeWindowOpen, openOfficeWindow, focusOfficeWindow, closeOfficeWindow } =
    useOfficeWindowState();

  if (isElectron && isOfficeWindowOpen) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center bg-[radial-gradient(circle_at_top,rgba(120,140,255,0.08),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] px-6 py-6">
        <div className="flex w-full max-w-xl flex-col items-center rounded-2xl border border-border/60 bg-card/80 px-6 py-8 text-center shadow-xl backdrop-blur-sm">
          <div className="mb-4 rounded-full border border-border/60 bg-background/80 p-3 text-muted-foreground">
            <PanelsTopLeft className="size-5" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Office is detached</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            The office is open in a separate window. Focus it to keep watching agents, or reattach it here.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Button size="sm" onClick={() => void focusOfficeWindow()}>
              <ArrowUpRight className="size-4" />
              Focus Office Window
            </Button>
            <Button size="sm" variant="outline" onClick={() => void closeOfficeWindow()}>
              Reattach Office Here
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-background">
      {isElectron && (
        <div className="absolute right-3 top-3 z-10">
          <Button size="sm" variant="outline" onClick={() => void openOfficeWindow()}>
            <ArrowUpRight className="size-4" />
            Pop Out Office
          </Button>
        </div>
      )}
      <VirtualOffice focusThreadId={props.focusThreadId ?? null} />
    </div>
  );
}

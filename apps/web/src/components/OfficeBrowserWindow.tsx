import { RefreshCwIcon, TvIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DetectedPreview } from "@t3tools/contracts";

import { Button } from "~/components/ui/button";
import OfficeWindowFrame, { type OfficeWindowRect } from "./OfficeWindowFrame";

interface OfficeBrowserWindowProps {
  groupKey: string;
  groupLabel: string;
  rect: OfficeWindowRect;
  zoom: number;
  zIndex: number;
  isFocused: boolean;
  accentColor: string;
  previews: ReadonlyArray<DetectedPreview>;
  selectedPreviewId: string | null;
  showChooser: boolean;
  onClose: () => void;
  onFocus: () => void;
  onRectChange: (rect: OfficeWindowRect) => void;
  onSelectPreview: (previewId: string) => void;
  onShowChooser: () => void;
}

function previewSubtitle(preview: DetectedPreview | null): string {
  if (!preview) {
    return "Waiting for an office preview";
  }
  const parsed = new URL(preview.url);
  return `${parsed.hostname}:${parsed.port}`;
}

export default function OfficeBrowserWindow({
  groupKey,
  groupLabel,
  rect,
  zoom,
  zIndex,
  isFocused,
  accentColor,
  previews,
  selectedPreviewId,
  showChooser,
  onClose,
  onFocus,
  onRectChange,
  onSelectPreview,
  onShowChooser,
}: OfficeBrowserWindowProps) {
  const [reloadNonce, setReloadNonce] = useState(0);
  const livePreviews = useMemo(
    () => previews.filter((preview) => preview.status === "live"),
    [previews],
  );
  const selectedPreview = useMemo(
    () => previews.find((preview) => preview.id === selectedPreviewId) ?? null,
    [previews, selectedPreviewId],
  );
  const shouldRenderChooser = showChooser && previews.length > 0;
  const shouldRenderPreview = !shouldRenderChooser && selectedPreview?.status === "live";

  useEffect(() => {
    setReloadNonce(0);
  }, [selectedPreviewId]);

  return (
    <OfficeWindowFrame
      rect={rect}
      zoom={zoom}
      zIndex={zIndex}
      isFocused={isFocused}
      accentColor={accentColor}
      onClose={onClose}
      onFocus={onFocus}
      onRectChange={onRectChange}
      closeButtonLabel="Close office browser window"
      rootAttributes={{
        "data-office-browser-window": groupKey,
      }}
      header={
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{groupLabel} Preview</div>
          <div className="truncate text-xs text-muted-foreground">{previewSubtitle(selectedPreview)}</div>
        </div>
      }
      headerActions={
        <>
          {previews.length > 1 ? (
            <Button
              size="sm"
              variant="outline"
              data-office-window-header-interactive="true"
              onClick={onShowChooser}
            >
              Choose Preview
            </Button>
          ) : null}
          <Button
            size="icon-sm"
            variant="outline"
            data-office-window-header-interactive="true"
            onClick={() => setReloadNonce((current) => current + 1)}
            aria-label="Reload office browser window"
          >
            <RefreshCwIcon className="size-4" />
          </Button>
        </>
      }
    >
      {shouldRenderPreview && selectedPreview ? (
        <iframe
          key={`${selectedPreview.id}:${reloadNonce}`}
          src={selectedPreview.url}
          title={`${groupLabel} preview`}
          className="h-full w-full border-0 bg-background"
          data-office-browser-iframe={groupKey}
          sandbox="allow-forms allow-modals allow-popups allow-same-origin allow-scripts"
        />
      ) : shouldRenderChooser ? (
        <div className="flex h-full flex-col overflow-y-auto bg-card/30 px-4 py-4">
          <div className="mb-3">
            <div className="text-sm font-semibold text-foreground">Choose a preview</div>
            <div className="text-xs text-muted-foreground">
              Multiple office previews were detected for this workspace.
            </div>
          </div>
          <div className="space-y-3">
            {previews.map((preview) => (
              <button
                key={preview.id}
                type="button"
                className="flex w-full items-center justify-between rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-left transition-colors hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-60"
                data-office-browser-preview-option={preview.id}
                onClick={() => onSelectPreview(preview.id)}
                disabled={preview.status !== "live"}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">{preview.url}</div>
                  <div className="truncate text-xs text-muted-foreground">{preview.cwd}</div>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                    preview.status === "live"
                      ? "bg-emerald-500/12 text-emerald-700"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {preview.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : selectedPreview ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-card/30 px-6 text-center">
          <div
            className="rounded-full border p-3"
            style={{
              borderColor: `${accentColor}44`,
              backgroundColor: `${accentColor}10`,
            }}
          >
            <TvIcon className="size-5" style={{ color: accentColor }} />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">Preview offline</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedPreview.url} is no longer reporting an active dev server.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setReloadNonce((current) => current + 1)}>
              Retry
            </Button>
            {livePreviews.length > 0 ? (
              <Button size="sm" onClick={onShowChooser}>
                Choose another preview
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-card/30 px-6 text-center">
          <div
            className="rounded-full border p-3"
            style={{
              borderColor: `${accentColor}44`,
              backgroundColor: `${accentColor}10`,
            }}
          >
            <TvIcon className="size-5" style={{ color: accentColor }} />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">No preview detected yet</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Start a dev server from one of this office&apos;s terminals. The TV will connect automatically when
              a local preview appears.
            </div>
          </div>
        </div>
      )}
    </OfficeWindowFrame>
  );
}

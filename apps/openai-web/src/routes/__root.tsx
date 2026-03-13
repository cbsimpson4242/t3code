import { ThreadId } from "@t3tools/contracts";
import {
  Outlet,
  createRootRouteWithContext,
  type ErrorComponentProps,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Throttler } from "@tanstack/react-pacer";

import { APP_DISPLAY_NAME } from "../branding";
import { Button } from "@legacy/components/ui/button";
import { AnchoredToastProvider, ToastProvider, toastManager } from "@legacy/components/ui/toast";
import { serverConfigQueryOptions, serverQueryKeys } from "@legacy/lib/serverReactQuery";
import { readNativeApi } from "@legacy/nativeApi";
import { useComposerDraftStore } from "@legacy/composerDraftStore";
import { useStore } from "@legacy/store";
import { useTerminalStateStore } from "@legacy/terminalStateStore";
import { preferredTerminalEditor } from "@legacy/terminal-links";
import { terminalRunningSubprocessFromEvent } from "@legacy/terminalActivity";
import { onServerConfigUpdated, onServerWelcome } from "@legacy/wsNativeApi";
import { providerQueryKeys } from "@legacy/lib/providerReactQuery";
import { collectActiveTerminalThreadIds } from "@legacy/lib/terminalStateCleanup";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: RootRouteView,
  errorComponent: RootRouteErrorView,
  head: () => ({
    meta: [{ name: "title", content: APP_DISPLAY_NAME }],
  }),
});

function RootRouteView() {
  if (!readNativeApi()) {
    return (
      <div className="flex h-screen flex-col bg-background text-foreground">
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted-foreground">Connecting to {APP_DISPLAY_NAME} server...</p>
        </div>
      </div>
    );
  }

  return (
    <ToastProvider>
      <AnchoredToastProvider>
        <EventRouter />
        <Outlet />
      </AnchoredToastProvider>
    </ToastProvider>
  );
}

function RootRouteErrorView({ error, reset }: ErrorComponentProps) {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "Unexpected error";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-xl rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl backdrop-blur-md">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {APP_DISPLAY_NAME}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Something went wrong.</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => reset()}>
            Try again
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>
      </section>
    </div>
  );
}

function EventRouter() {
  const syncServerReadModel = useStore((store) => store.syncServerReadModel);
  const removeOrphanedTerminalStates = useTerminalStateStore(
    (store) => store.removeOrphanedTerminalStates,
  );
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const pathnameRef = useRef(pathname);
  const lastConfigIssuesSignatureRef = useRef<string | null>(null);

  pathnameRef.current = pathname;

  useEffect(() => {
    const onOpenThreadInMainWindow = window.desktopBridge?.onOpenThreadInMainWindow;
    if (typeof onOpenThreadInMainWindow !== "function") {
      return;
    }

    const unsubscribe = onOpenThreadInMainWindow((threadId) => {
      void navigate({ to: "/$threadId", params: { threadId } });
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  useEffect(() => {
    const api = readNativeApi();
    if (!api) return;
    let disposed = false;
    let latestSequence = 0;
    let syncing = false;
    let pending = false;
    let needsProviderInvalidation = false;

    const flushSnapshotSync = async (): Promise<void> => {
      const snapshot = await api.orchestration.getSnapshot();
      if (disposed) return;
      latestSequence = Math.max(latestSequence, snapshot.snapshotSequence);
      syncServerReadModel(snapshot);
      const draftThreadIds = Object.keys(
        useComposerDraftStore.getState().draftThreadsByThreadId,
      ) as ThreadId[];
      const activeThreadIds = collectActiveTerminalThreadIds({
        snapshotThreads: snapshot.threads,
        draftThreadIds,
      });
      removeOrphanedTerminalStates(activeThreadIds);
      if (pending) {
        pending = false;
        await flushSnapshotSync();
      }
    };

    const syncSnapshot = async () => {
      if (syncing) {
        pending = true;
        return;
      }
      syncing = true;
      pending = false;
      try {
        await flushSnapshotSync();
      } catch {
        // Preserve current state until the next event.
      }
      syncing = false;
    };

    const domainEventFlushThrottler = new Throttler(
      () => {
        if (needsProviderInvalidation) {
          needsProviderInvalidation = false;
          void queryClient.invalidateQueries({ queryKey: providerQueryKeys.all });
          void queryClient.invalidateQueries({ queryKey: providerQueryKeys.runtimeCatalog });
        }
        void syncSnapshot();
      },
      {
        wait: 100,
        leading: false,
        trailing: true,
      },
    );

    const unsubDomainEvent = api.orchestration.onDomainEvent((event) => {
      if (event.sequence <= latestSequence) {
        return;
      }
      latestSequence = event.sequence;
      if (event.type === "thread.turn-diff-completed" || event.type === "thread.reverted") {
        needsProviderInvalidation = true;
      }
      domainEventFlushThrottler.maybeExecute();
    });
    const unsubRuntimeCatalog = api.runtime.onCatalogUpdated(() => {
      void queryClient.invalidateQueries({ queryKey: providerQueryKeys.runtimeCatalog });
    });
    const unsubTerminalEvent = api.terminal.onEvent((event) => {
      const hasRunningSubprocess = terminalRunningSubprocessFromEvent(event);
      if (hasRunningSubprocess === null) {
        return;
      }
      useTerminalStateStore
        .getState()
        .setTerminalActivity(
          ThreadId.makeUnsafe(event.threadId),
          event.terminalId,
          hasRunningSubprocess,
        );
    });
    const unsubWelcome = onServerWelcome((_payload) => {
      void syncSnapshot();
    });
    const unsubServerConfigUpdated = onServerConfigUpdated((payload) => {
      const signature = JSON.stringify(payload.issues);
      if (lastConfigIssuesSignatureRef.current === signature) {
        return;
      }
      lastConfigIssuesSignatureRef.current = signature;

      void queryClient.invalidateQueries({ queryKey: serverQueryKeys.config() });
      const issue = payload.issues.find((entry) => entry.kind.startsWith("keybindings."));
      if (!issue) {
        toastManager.add({
          type: "success",
          title: "Keybindings updated",
          description: "Keybindings configuration reloaded successfully.",
        });
        return;
      }

      toastManager.add({
        type: "warning",
        title: "Invalid keybindings configuration",
        description: issue.message,
        actionProps: {
          children: "Open keybindings.json",
          onClick: () => {
            void queryClient
              .ensureQueryData(serverConfigQueryOptions())
              .then((config) =>
                api.shell.openInEditor(config.keybindingsConfigPath, preferredTerminalEditor()),
              )
              .catch((error) => {
                toastManager.add({
                  type: "error",
                  title: "Unable to open keybindings file",
                  description:
                    error instanceof Error ? error.message : "Unknown error opening file.",
                });
              });
          },
        },
      });
    });
    return () => {
      disposed = true;
      needsProviderInvalidation = false;
      domainEventFlushThrottler.cancel();
      unsubDomainEvent();
      unsubRuntimeCatalog();
      unsubTerminalEvent();
      unsubWelcome();
      unsubServerConfigUpdated();
    };
  }, [navigate, queryClient, removeOrphanedTerminalStates, syncServerReadModel]);

  return null;
}

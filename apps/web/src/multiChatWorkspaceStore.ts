import type { ScopedThreadRef } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime";
import { create } from "zustand";

export const MAX_WORKSPACE_CHAT_PANES = 4;

export interface WorkspaceChatPane {
  readonly workspaceKey: string;
  readonly threadRef: ScopedThreadRef;
}

interface MultiChatWorkspaceState {
  readonly panes: WorkspaceChatPane[];
  readonly openPane: (workspaceKey: string, threadRef: ScopedThreadRef) => void;
  readonly closePane: (threadRef: ScopedThreadRef) => void;
  readonly closeAll: () => void;
  readonly prunePrimaryPane: (threadRef: ScopedThreadRef) => void;
}

function threadRefsEqual(left: ScopedThreadRef, right: ScopedThreadRef): boolean {
  return left.environmentId === right.environmentId && left.threadId === right.threadId;
}

export function openWorkspacePane(
  panes: readonly WorkspaceChatPane[],
  workspaceKey: string,
  threadRef: ScopedThreadRef,
): WorkspaceChatPane[] {
  const key = scopedThreadKey(threadRef);
  const otherWorkspacePanes = panes.filter(
    (pane) => pane.workspaceKey !== workspaceKey && scopedThreadKey(pane.threadRef) !== key,
  );
  const currentWorkspacePanes = panes.filter((pane) => pane.workspaceKey === workspaceKey);
  const withoutExisting = currentWorkspacePanes.filter(
    (pane) => scopedThreadKey(pane.threadRef) !== key,
  );
  const nextWorkspacePanes = [...withoutExisting, { workspaceKey, threadRef }].slice(
    -(MAX_WORKSPACE_CHAT_PANES - 1),
  );
  return [...otherWorkspacePanes, ...nextWorkspacePanes];
}

export function closeWorkspacePane(
  panes: readonly WorkspaceChatPane[],
  threadRef: ScopedThreadRef,
): WorkspaceChatPane[] {
  return panes.filter((pane) => !threadRefsEqual(pane.threadRef, threadRef));
}

export const useMultiChatWorkspaceStore = create<MultiChatWorkspaceState>((set) => ({
  panes: [],
  openPane: (workspaceKey, threadRef) =>
    set((state) => ({ panes: openWorkspacePane(state.panes, workspaceKey, threadRef) })),
  closePane: (threadRef) => set((state) => ({ panes: closeWorkspacePane(state.panes, threadRef) })),
  closeAll: () => set({ panes: [] }),
  prunePrimaryPane: (threadRef) =>
    set((state) => ({ panes: closeWorkspacePane(state.panes, threadRef) })),
}));

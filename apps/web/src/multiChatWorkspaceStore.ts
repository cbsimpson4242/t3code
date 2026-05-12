import type { ScopedThreadRef } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime";
import { create } from "zustand";

export const MAX_WORKSPACE_CHAT_PANES = 4;

export interface WorkspaceChatPane {
  readonly threadRef: ScopedThreadRef;
}

interface MultiChatWorkspaceState {
  readonly panes: WorkspaceChatPane[];
  readonly openPane: (threadRef: ScopedThreadRef) => void;
  readonly closePane: (threadRef: ScopedThreadRef) => void;
  readonly closeAll: () => void;
  readonly prunePrimaryPane: (threadRef: ScopedThreadRef) => void;
}

function threadRefsEqual(left: ScopedThreadRef, right: ScopedThreadRef): boolean {
  return left.environmentId === right.environmentId && left.threadId === right.threadId;
}

export function openWorkspacePane(
  panes: readonly WorkspaceChatPane[],
  threadRef: ScopedThreadRef,
): WorkspaceChatPane[] {
  const key = scopedThreadKey(threadRef);
  const withoutExisting = panes.filter((pane) => scopedThreadKey(pane.threadRef) !== key);
  return [...withoutExisting, { threadRef }].slice(-(MAX_WORKSPACE_CHAT_PANES - 1));
}

export function closeWorkspacePane(
  panes: readonly WorkspaceChatPane[],
  threadRef: ScopedThreadRef,
): WorkspaceChatPane[] {
  return panes.filter((pane) => !threadRefsEqual(pane.threadRef, threadRef));
}

export const useMultiChatWorkspaceStore = create<MultiChatWorkspaceState>((set) => ({
  panes: [],
  openPane: (threadRef) => set((state) => ({ panes: openWorkspacePane(state.panes, threadRef) })),
  closePane: (threadRef) => set((state) => ({ panes: closeWorkspacePane(state.panes, threadRef) })),
  closeAll: () => set({ panes: [] }),
  prunePrimaryPane: (threadRef) =>
    set((state) => ({ panes: closeWorkspacePane(state.panes, threadRef) })),
}));

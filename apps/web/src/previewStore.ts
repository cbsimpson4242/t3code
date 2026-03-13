import type { PreviewSnapshot } from "@t3tools/contracts";
import { create } from "zustand";

interface PreviewState {
  snapshot: PreviewSnapshot;
  setSnapshot: (snapshot: PreviewSnapshot) => void;
  clear: () => void;
}

const EMPTY_PREVIEW_SNAPSHOT: PreviewSnapshot = {
  previews: [],
};

export const usePreviewStore = create<PreviewState>((set) => ({
  snapshot: EMPTY_PREVIEW_SNAPSHOT,
  setSnapshot: (snapshot) => set({ snapshot }),
  clear: () => set({ snapshot: EMPTY_PREVIEW_SNAPSHOT }),
}));

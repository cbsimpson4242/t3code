import type { PreviewSnapshot, TerminalEvent } from "@t3tools/contracts";
import { Effect, Layer } from "effect";

import { TerminalManager } from "../../terminal/Services/Manager";
import { PreviewRegistry, type PreviewRegistryShape } from "../Services/Registry";
import {
  applyTerminalEventToPreviewSource,
  flattenPreviewSources,
} from "../previewDetection";

interface PreviewListener {
  (snapshot: PreviewSnapshot): void;
}

export class PreviewRegistryRuntime implements PreviewRegistryShape {
  private readonly listeners = new Set<PreviewListener>();
  private readonly sources = new Map<
    string,
    ReturnType<typeof applyTerminalEventToPreviewSource> extends infer T
      ? Exclude<T, null>
      : never
  >();
  private snapshot: PreviewSnapshot = { previews: [] };

  private sourceKey(threadId: string, terminalId: string): string {
    return `${threadId}\u0000${terminalId}`;
  }

  private emitIfChanged(nextSnapshot: PreviewSnapshot): boolean {
    const previousSerialized = JSON.stringify(this.snapshot);
    const nextSerialized = JSON.stringify(nextSnapshot);
    if (previousSerialized === nextSerialized) {
      return false;
    }
    this.snapshot = nextSnapshot;
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
    return true;
  }

  handleTerminalEvent(event: TerminalEvent): boolean {
    const key = this.sourceKey(event.threadId, event.terminalId);
    const nextSource = applyTerminalEventToPreviewSource(this.sources.get(key) ?? null, event);
    if (!nextSource) {
      return false;
    }
    this.sources.set(key, nextSource);
    return this.emitIfChanged({ previews: flattenPreviewSources(this.sources) });
  }

  readonly getSnapshot = () => Effect.succeed(this.snapshot);

  readonly subscribe = (listener: PreviewListener) =>
    Effect.sync(() => {
      this.listeners.add(listener);
      return () => {
        this.listeners.delete(listener);
      };
    });
}

export const PreviewRegistryLive = Layer.effect(
  PreviewRegistry,
  Effect.gen(function* () {
    const terminalManager = yield* TerminalManager;
    const runtime = new PreviewRegistryRuntime();
    const unsubscribe = yield* terminalManager.subscribe((event) => {
      runtime.handleTerminalEvent(event);
    });
    yield* Effect.addFinalizer(() => Effect.sync(() => unsubscribe()));
    return runtime;
  }),
);

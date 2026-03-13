import type { PreviewSnapshot } from "@t3tools/contracts";
import { Effect, ServiceMap } from "effect";

export interface PreviewRegistryShape {
  readonly getSnapshot: () => Effect.Effect<PreviewSnapshot>;
  readonly subscribe: (
    listener: (snapshot: PreviewSnapshot) => void,
  ) => Effect.Effect<() => void>;
}

export class PreviewRegistry extends ServiceMap.Service<PreviewRegistry, PreviewRegistryShape>()(
  "t3/preview/Services/Registry/PreviewRegistry",
) {}

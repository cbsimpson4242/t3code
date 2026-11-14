import type * as Context from "effect/Context";
import { it, vi } from "vite-plus/test";

import "~/index.css";

// The route loads ChatView lazily, and its first transform takes seconds; keep that out of the test timeout.
import "~/components/ChatView";
import type { FakeDriver } from "../../../test/fakeEnvironment";
import { runPinTabDragScenario } from "../../../test/pinTabDragScenario";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock(
  "../../../../../packages/client-runtime/src/connection/driver.ts",
  async (importOriginal) => {
    const [actual, { fakeDriver }, Layer] = await Promise.all([
      importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
      import("../../../test/fakeEnvironment"),
      import("effect/Layer"),
    ]);
    return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
  },
);

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

it("drags threads between the Pinned and Threads tabs in the Simple grid", async () => {
  await runPinTabDragScenario("simple");
});

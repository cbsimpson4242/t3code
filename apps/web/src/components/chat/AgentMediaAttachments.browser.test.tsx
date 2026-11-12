import type { PreparedConnection } from "@t3tools/client-runtime/connection";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { parseAgentMessageContent } from "@t3tools/shared/voiceMessage";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { AgentMediaAttachments } from "./AgentMediaAttachments";

const TINY_GIF = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const SIZE_BYTES = 52_428;

vi.mock(import("~/state/assets"), async (original) => {
  const { AsyncResult, Atom } = await import("effect/reactivity");
  const createUrl = Atom.family((key: string) =>
    Atom.make(() =>
      key.includes("missing")
        ? AsyncResult.fail(new Error("not found"))
        : AsyncResult.success({
            relativeUrl: TINY_GIF,
            expiresAt: Number.MAX_SAFE_INTEGER,
            fileRevision: `1:2:${SIZE_BYTES}:3:4`,
          }),
    ).pipe(Atom.keepAlive),
  );
  const actual = await original();
  return {
    ...actual,
    assetEnvironment: {
      ...actual.assetEnvironment,
      createUrl: (target: { readonly input: unknown }) => createUrl(JSON.stringify(target.input)),
    },
  };
});
vi.mock(import("~/state/session"), async (original) => {
  const { Option } = await import("effect");
  const { PrimaryConnectionTarget } = await import("@t3tools/client-runtime/connection");
  const { EnvironmentId } = await import("@t3tools/contracts");
  const target = new PrimaryConnectionTarget({
    environmentId: EnvironmentId.make("environment-1"),
    label: "Local",
    httpBaseUrl: "http://localhost:1",
    wsBaseUrl: "ws://localhost:1",
  });
  const prepared: PreparedConnection = {
    environmentId: target.environmentId,
    label: target.label,
    httpBaseUrl: target.httpBaseUrl,
    socketUrl: target.wsBaseUrl,
    httpAuthorization: null,
    target,
  };
  return { ...(await original()), usePreparedConnection: () => Option.some(prepared) };
});
vi.mock(import("~/state/filesystem"), async (original) => ({
  ...(await original()),
  useFilesystemReadAccess: () => ({ canReadFiles: true, isPending: false, error: null }),
}));

const environmentId = EnvironmentId.make("environment-1");
const threadRef = { environmentId, threadId: ThreadId.make("thread-1") };

function mount(text: string) {
  const parsed = parseAgentMessageContent(text);
  return render(
    <AgentMediaAttachments
      messageId="message-1"
      items={parsed.media}
      environmentId={environmentId}
      threadRef={threadRef}
      theme="light"
    />,
  );
}

describe("AgentMediaAttachments", () => {
  it("renders an image inline and pdf and eml files as cards with actions", async () => {
    const screen = await mount(
      "Done.\n\nMEDIA:/tmp/out/chart.png\nMEDIA:/tmp/out/report.pdf\nMEDIA:/tmp/out/mail.eml",
    );

    await expect.element(screen.getByRole("img", { name: "chart.png" })).toBeVisible();

    const cards = screen.getByTestId("agent-file-attachment");
    expect(cards.elements()).toHaveLength(2);
    await expect.element(cards.nth(0).getByText("report.pdf")).toBeVisible();
    await expect.element(cards.nth(0).getByText("52 KB")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Preview report.pdf" })).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Download report.pdf" })).toBeVisible();
    await expect.element(cards.nth(1).getByText("mail.eml")).toBeVisible();
    // The preview viewer has no reader for .eml, so only Download is offered.
    expect(screen.getByRole("button", { name: "Preview mail.eml" }).elements()).toHaveLength(0);
    await expect.element(screen.getByRole("button", { name: "Download mail.eml" })).toBeVisible();
  });

  it("renders audio with native controls and video inline", async () => {
    const screen = await mount("MEDIA:/tmp/out/clip.mp3\nMEDIA:/tmp/out/demo.mp4");
    const audio = screen.getByLabelText("clip.mp3");
    await expect.element(audio).toBeVisible();
    expect(audio.element().hasAttribute("controls")).toBe(true);
    expect(screen.getByTestId("agent-audio-attachment").elements()).toHaveLength(1);
  });

  it("shows a clear unavailable state with Retry when the file cannot be read", async () => {
    const screen = await mount("MEDIA:/tmp/out/missing/report.pdf");
    await expect.element(screen.getByText("File not found or unavailable")).toBeVisible();
    await expect.element(screen.getByRole("button", { name: "Retry report.pdf" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Download report.pdf" }).elements()).toHaveLength(0);
  });
});

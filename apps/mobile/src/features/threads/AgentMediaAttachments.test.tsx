import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { parseAgentMessageContent } from "@t3tools/shared/voiceMessage";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const m = vi.hoisted(() => ({
  asset: {
    _tag: "Success",
    url: "https://fixture.invalid/signed",
    fileRevision: "1:2:52428:3:4",
  } as
    | { _tag: "Success"; url: string; fileRevision?: string }
    | { _tag: "Failure"; reason: string }
    | { _tag: "Loading" },
  refresh: vi.fn(async () => "https://fixture.invalid/fresh" as string | null),
  save: vi.fn(async () => "downloads" as "downloads" | "folder" | "cancelled"),
  share: vi.fn(async () => {}),
  open: vi.fn(async () => {}),
  alert: vi.fn(),
  resources: [] as unknown[],
}));

vi.mock("react-native", async () => {
  const R = await import("react");
  return {
    View: ({ children, testID }: any) =>
      R.createElement("div", { "data-testid": testID }, children),
    Pressable: ({ children, onPress, disabled, accessibilityLabel }: any) =>
      R.createElement(
        "button",
        { onClick: onPress, disabled, "aria-label": accessibilityLabel },
        children,
      ),
  };
});
vi.mock("../../components/ui/AppText", () => ({
  AppText: ({ children }: any) => React.createElement("span", null, children),
}));
vi.mock("../../components/ui/AppSymbol", () => ({ SymbolView: () => null }));
vi.mock("../../components/ui/AppActivityIndicator", () => ({
  AppActivityIndicator: () => React.createElement("span", null, "Working"),
}));
vi.mock("../../components/PierreEntryIcon", () => ({ PierreEntryIcon: () => null }));
vi.mock("../../components/ui/Dialog", () => ({ alert: m.alert }));
vi.mock("../../state/assets", () => ({
  useAssetUrlState: (_environmentId: unknown, resource: unknown) => {
    m.resources.push(resource);
    return m.asset;
  },
  useRefreshAssetUrl: () => m.refresh,
}));
vi.mock("../../lib/attachmentDownload", () => ({
  downloadAndShareAttachment: m.share,
  openAttachmentInViewer: m.open,
  saveAttachmentToDownloads: m.save,
  nativeViewerErrorMessage: () => "No viewer",
}));
async function stub(name: string) {
  const R = await import("react");
  return (props: any) =>
    R.createElement("div", {
      "data-testid": name,
      "data-path": props.path ?? props.source?.name,
    });
}
vi.mock("./ThreadMarkdownImage", async () => ({ ThreadMarkdownImage: await stub("image") }));
vi.mock("./ThreadMarkdownVideo", async () => ({ ThreadMarkdownVideo: await stub("video") }));
vi.mock("./ThreadInlineFilePreview", async () => ({
  ThreadInlineFilePreview: await stub("audio"),
}));
vi.mock("./VoiceMessagePlayer", async () => ({ VoiceMessagePlayer: await stub("voice") }));

import { AgentMediaAttachments } from "./AgentMediaAttachments";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function mount(text: string) {
  await act(async () => {
    root.render(
      <AgentMediaAttachments
        messageId="message-1"
        items={parseAgentMessageContent(text).media}
        environmentId={"environment" as EnvironmentId}
        threadId={"thread" as ThreadId}
        onPressPreview={vi.fn()}
        onPlaybackStart={vi.fn()}
      />,
    );
  });
}
const button = (label: string) =>
  container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
const flush = () => act(async () => {});

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  m.asset = {
    _tag: "Success",
    url: "https://fixture.invalid/signed",
    fileRevision: "1:2:52428:3:4",
  };
  m.resources = [];
  m.refresh.mockResolvedValue("https://fixture.invalid/fresh");
  m.save.mockResolvedValue("downloads");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("AgentMediaAttachments", () => {
  it("routes each kind to its renderer in message order", async () => {
    await mount(
      [
        "MEDIA:/tmp/chart.png",
        "MEDIA:/tmp/demo.mp4",
        "MEDIA:/tmp/song.mp3",
        "[[audio_as_voice]]",
        "MEDIA:/tmp/voice.ogg",
        "MEDIA:/tmp/report.pdf",
      ].join("\n"),
    );
    expect(
      [...container.querySelectorAll("[data-testid]")].map((node) =>
        node.getAttribute("data-testid"),
      ),
    ).toEqual(["image", "video", "audio", "voice", "agent-file-attachment"]);
  });

  it("shows a file card with its name and size, with Save and Share actions", async () => {
    await mount("MEDIA:/tmp/out/mail.eml");
    const card = container.querySelector('[data-testid="agent-file-attachment"]')!;
    expect(card.textContent).toContain("mail.eml");
    expect(card.textContent).toContain("52 KB");
    expect(button("Save attachment to Downloads")).toBeTruthy();
    expect(button("Share attachment")).toBeTruthy();
    // The signed URL must allow any file type, so the card asks for the attachment disposition.
    expect(m.resources.at(-1)).toMatchObject({
      _tag: "media-file",
      path: "/tmp/out/mail.eml",
      disposition: "attachment",
    });
  });

  it("saves to Downloads from a freshly signed URL and confirms", async () => {
    await mount("MEDIA:/tmp/out/report.pdf");
    await act(async () => button("Save attachment to Downloads")!.click());
    await flush();
    expect(m.refresh).toHaveBeenCalledOnce();
    expect(m.save).toHaveBeenCalledWith({
      url: "https://fixture.invalid/fresh",
      attachment: { name: "report.pdf", mimeType: "application/pdf" },
      signal: expect.any(AbortSignal),
    });
    expect(m.alert).toHaveBeenCalledWith("Saved", "report.pdf is in your Downloads folder.");
  });

  it("stays quiet when the save is cancelled", async () => {
    m.save.mockResolvedValue("cancelled");
    await mount("MEDIA:/tmp/out/report.pdf");
    await act(async () => button("Save attachment to Downloads")!.click());
    await flush();
    expect(m.alert).not.toHaveBeenCalled();
  });

  it("opens the Android share sheet through the shared download helper", async () => {
    await mount("MEDIA:/tmp/out/report.pdf");
    await act(async () => button("Share attachment")!.click());
    await flush();
    expect(m.share).toHaveBeenCalledWith({
      url: "https://fixture.invalid/fresh",
      attachment: { name: "report.pdf", mimeType: "application/pdf" },
      signal: expect.any(AbortSignal),
    });
  });

  it("opens the file in the default app when the card is tapped", async () => {
    await mount("MEDIA:/tmp/out/report.pdf");
    await act(async () => button("Open report.pdf")!.click());
    await flush();
    expect(m.open).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "https://fixture.invalid/fresh" }),
    );
  });

  it("reports a failed save", async () => {
    m.save.mockRejectedValue(new Error("Could not download the attachment."));
    await mount("MEDIA:/tmp/out/report.pdf");
    await act(async () => button("Save attachment to Downloads")!.click());
    await flush();
    expect(m.alert).toHaveBeenCalledWith(
      "Could not save file",
      "Could not download the attachment.",
    );
  });

  it("shows an unavailable state with Retry instead of actions when the file cannot be read", async () => {
    m.asset = { _tag: "Failure", reason: "failed" };
    await mount("MEDIA:/tmp/out/missing.pdf");
    expect(container.textContent).toContain("File not found or unavailable");
    expect(button("Retry missing.pdf")).toBeTruthy();
    expect(button("Save attachment to Downloads")).toBeNull();
    expect(button("Share attachment")).toBeNull();
    await act(async () => button("Retry missing.pdf")!.click());
    expect(m.resources.length).toBeGreaterThan(1);
  });
});

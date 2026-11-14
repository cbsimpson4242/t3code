import { DndContext } from "@dnd-kit/core";
import { useState } from "react";
import { expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import type { SidebarPinTab } from "../Sidebar.logic";
import { SidebarPinTabs } from "./SidebarPinTabs";

function Harness(props: { dragging?: boolean; dropTargeted?: boolean }) {
  const [tab, setTab] = useState<SidebarPinTab>("threads");
  return (
    <DndContext>
      <SidebarPinTabs
        idPrefix="pin-tabs-test"
        tab={tab}
        pinnedCount={1}
        threadsCount={12}
        dragging={props.dragging ?? false}
        dropTargeted={props.dropTargeted ?? false}
        onSelect={setTab}
      />
    </DndContext>
  );
}

it("labels each tab with its count and switches by click and arrow keys", async () => {
  await using screen = await render(<Harness />);
  const pinned = screen.getByRole("tab", { name: "Pinned, 1 thread" });
  const threads = screen.getByRole("tab", { name: "Threads, 12 threads" });
  await expect.element(screen.getByRole("tablist", { name: "Thread list" })).toBeInTheDocument();
  await expect.element(threads).toHaveAttribute("aria-selected", "true");
  await expect.element(threads).toHaveAttribute("tabindex", "0");
  await expect.element(pinned).toHaveAttribute("aria-selected", "false");
  await expect.element(pinned).toHaveAttribute("tabindex", "-1");

  await userEvent.click(pinned);
  await expect.element(pinned).toHaveAttribute("aria-selected", "true");
  await expect.element(threads).toHaveAttribute("aria-selected", "false");

  await userEvent.keyboard("{ArrowRight}");
  await expect.element(threads).toHaveAttribute("aria-selected", "true");
  await expect.element(threads).toHaveFocus();
  await userEvent.keyboard("{Home}");
  await expect.element(pinned).toHaveAttribute("aria-selected", "true");
  await expect.element(pinned).toHaveFocus();
  await userEvent.keyboard("{End}");
  await expect.element(threads).toHaveAttribute("aria-selected", "true");
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(pinned).toHaveFocus();
});

it("marks the Pinned tab as the drop target only while a thread is over it", async () => {
  await using screen = await render(<Harness dragging dropTargeted />);
  await expect
    .element(screen.getByRole("tab", { name: "Pinned, 1 thread" }))
    .toHaveAttribute("data-drop-target");
  await expect
    .element(screen.getByRole("tab", { name: "Threads, 12 threads" }))
    .not.toHaveAttribute("data-drop-target");
});

it("does not mark the Pinned tab as a drop target when nothing is dragged", async () => {
  await using screen = await render(<Harness dropTargeted />);
  await expect
    .element(screen.getByRole("tab", { name: "Pinned, 1 thread" }))
    .not.toHaveAttribute("data-drop-target");
});

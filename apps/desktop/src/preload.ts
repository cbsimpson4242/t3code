import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "@t3tools/contracts";

const PICK_FOLDER_CHANNEL = "desktop:pick-folder";
const CONFIRM_CHANNEL = "desktop:confirm";
const CONTEXT_MENU_CHANNEL = "desktop:context-menu";
const OPEN_EXTERNAL_CHANNEL = "desktop:open-external";
const OFFICE_OPEN_CHANNEL = "desktop:office-open";
const OFFICE_FOCUS_CHANNEL = "desktop:office-focus";
const OFFICE_CLOSE_CHANNEL = "desktop:office-close";
const OFFICE_GET_OPEN_CHANNEL = "desktop:office-get-open";
const OFFICE_OPEN_CHANGE_CHANNEL = "desktop:office-open-change";
const MENU_ACTION_CHANNEL = "desktop:menu-action";
const OPEN_THREAD_IN_MAIN_WINDOW_CHANNEL = "desktop:open-thread-in-main-window";
const OPEN_THREAD_IN_MAIN_WINDOW_EVENT_CHANNEL = "desktop:open-thread-in-main-window-event";
const UPDATE_STATE_CHANNEL = "desktop:update-state";
const UPDATE_GET_STATE_CHANNEL = "desktop:update-get-state";
const UPDATE_DOWNLOAD_CHANNEL = "desktop:update-download";
const UPDATE_INSTALL_CHANNEL = "desktop:update-install";
const wsUrl = process.env.T3CODE_DESKTOP_WS_URL ?? null;

contextBridge.exposeInMainWorld("desktopBridge", {
  getWsUrl: () => wsUrl,
  pickFolder: () => ipcRenderer.invoke(PICK_FOLDER_CHANNEL),
  confirm: (message) => ipcRenderer.invoke(CONFIRM_CHANNEL, message),
  openOfficeWindow: () => ipcRenderer.invoke(OFFICE_OPEN_CHANNEL),
  focusOfficeWindow: () => ipcRenderer.invoke(OFFICE_FOCUS_CHANNEL),
  closeOfficeWindow: () => ipcRenderer.invoke(OFFICE_CLOSE_CHANNEL),
  getOfficeWindowOpen: () => ipcRenderer.invoke(OFFICE_GET_OPEN_CHANNEL),
  onOfficeWindowOpenChange: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, open: unknown) => {
      if (typeof open !== "boolean") return;
      listener(open);
    };

    ipcRenderer.on(OFFICE_OPEN_CHANGE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(OFFICE_OPEN_CHANGE_CHANNEL, wrappedListener);
    };
  },
  openThreadInMainWindow: (threadId: string) =>
    ipcRenderer.invoke(OPEN_THREAD_IN_MAIN_WINDOW_CHANNEL, threadId),
  onOpenThreadInMainWindow: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, threadId: unknown) => {
      if (typeof threadId !== "string") return;
      listener(threadId);
    };

    ipcRenderer.on(OPEN_THREAD_IN_MAIN_WINDOW_EVENT_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(OPEN_THREAD_IN_MAIN_WINDOW_EVENT_CHANNEL, wrappedListener);
    };
  },
  showContextMenu: (items, position) => ipcRenderer.invoke(CONTEXT_MENU_CHANNEL, items, position),
  openExternal: (url: string) => ipcRenderer.invoke(OPEN_EXTERNAL_CHANNEL, url),
  onMenuAction: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, action: unknown) => {
      if (typeof action !== "string") return;
      listener(action);
    };

    ipcRenderer.on(MENU_ACTION_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(MENU_ACTION_CHANNEL, wrappedListener);
    };
  },
  getUpdateState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) return;
      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(UPDATE_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, wrappedListener);
    };
  },
} satisfies DesktopBridge);

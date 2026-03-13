/// <reference types="vite/client" />

import type { DesktopBridge, NativeApi } from "@t3tools/contracts";

declare global {
  interface Window {
    nativeApi?: NativeApi;
    desktopBridge?: DesktopBridge;
  }
}

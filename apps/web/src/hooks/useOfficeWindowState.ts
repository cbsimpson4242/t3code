import { useCallback, useEffect, useState } from "react";

import { isElectron } from "../env";
import { toastManager } from "../components/ui/toast";

function officePopupUrl() {
  return `${window.location.origin}${window.location.pathname}#/office`;
}

function openOfficeWindowFallback() {
  const popup = window.open(
    officePopupUrl(),
    "t3-office-window",
    "popup=yes,width=1360,height=860,resizable=yes,scrollbars=no",
  );

  if (popup) {
    popup.focus();
    return true;
  }

  return false;
}

export function useOfficeWindowState() {
  const [isOfficeWindowOpen, setIsOfficeWindowOpen] = useState(false);

  useEffect(() => {
    if (!isElectron) {
      setIsOfficeWindowOpen(false);
      return;
    }

    let disposed = false;
    const bridge = window.desktopBridge;
    if (!bridge) {
      setIsOfficeWindowOpen(false);
      return;
    }

    void bridge.getOfficeWindowOpen().then((open) => {
      if (!disposed) {
        setIsOfficeWindowOpen(open);
      }
    });

    const unsubscribe = bridge.onOfficeWindowOpenChange((open) => {
      setIsOfficeWindowOpen(open);
    });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  const openOfficeWindow = useCallback(async () => {
    const bridge = window.desktopBridge;
    if (bridge?.openOfficeWindow) {
      try {
        await bridge.openOfficeWindow();
        return;
      } catch (error) {
        console.error("Failed to open office window via desktop bridge", error);
      }
    }

    if (openOfficeWindowFallback()) {
      return;
    }

    toastManager.add({
      type: "warning",
      title: "Unable to open office window",
      description: isElectron
        ? "Restart the desktop app to load the new office window bridge."
        : "Your browser blocked the popup window.",
    });
  }, []);

  const focusOfficeWindow = useCallback(async () => {
    await window.desktopBridge?.focusOfficeWindow?.();
  }, []);

  const closeOfficeWindow = useCallback(async () => {
    await window.desktopBridge?.closeOfficeWindow?.();
  }, []);

  return {
    isOfficeWindowOpen,
    openOfficeWindow,
    focusOfficeWindow,
    closeOfficeWindow,
  };
}

export default useOfficeWindowState;

import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import type { EnvironmentId } from "@t3tools/contracts";
import { useRef } from "react";

import * as Dialog from "../../components/ui/Dialog";
import { useServerConfigs } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { useAtomCommand } from "../../state/use-atom-command";
import { useRemoteConnectionStatus } from "../../state/use-remote-environment-registry";
import { resolveNewTaskScratchOption } from "./new-task-project-selection";

function reportGeneralProjectFailure(error: unknown) {
  Dialog.alert(
    "Could not start without a project",
    error instanceof Error
      ? error.message
      : "The folder for threads without a project could not be created.",
  );
}

/**
 * The folder a thread without a project runs in, on the preferred machine when it offers one.
 * `open` reports its own failures and returns null.
 */
export function useGeneralProject(preferredEnvironmentId: EnvironmentId | null) {
  const { connectedEnvironments } = useRemoteConnectionStatus();
  const serverConfigs = useServerConfigs();
  const openScratch = useAtomCommand(projectEnvironment.openScratch, { reportFailure: false });
  const inFlightRef = useRef(false);
  const option = resolveNewTaskScratchOption({
    environments: connectedEnvironments,
    serverConfigs,
    selectedEnvironmentId: preferredEnvironmentId,
  });
  const environmentId = option?.environmentId ?? null;

  const open = async (): Promise<EnvironmentProject | null> => {
    if (environmentId === null || option?.ready !== true || inFlightRef.current) return null;
    inFlightRef.current = true;
    try {
      const result = await openScratch({ environmentId, input: {} });
      inFlightRef.current = false;
      if (result._tag === "Success") return result.value;
      if (!isAtomCommandInterrupted(result)) {
        reportGeneralProjectFailure(squashAtomCommandFailure(result));
      }
      return null;
    } catch (error) {
      inFlightRef.current = false;
      reportGeneralProjectFailure(error);
      return null;
    }
  };

  return { available: option?.ready === true, open };
}

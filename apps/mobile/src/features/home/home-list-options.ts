import type { EnvironmentId, SidebarProjectGroupingMode } from "@t3tools/contracts";
import { DEFAULT_SIDEBAR_PROJECT_SORT_ORDER } from "@t3tools/contracts";
import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { createContext, createElement, useContext, useState, type PropsWithChildren } from "react";

import type { ThreadListFilters } from "../../persistence/mobile-preferences";
import { updateMobilePreferencesAtom } from "../../state/preferences";
import type { HomeProjectSortOrder } from "./homeThreadList";

export interface HomeListOptions {
  readonly selectedEnvironmentId: EnvironmentId | null;
  /** The projects whose threads are listed; empty lists every project. */
  readonly selectedProjectKeys: readonly string[];
  readonly projectSortOrder: HomeProjectSortOrder;
}

export interface ResolvedHomeListOptions extends HomeListOptions {
  readonly projectGroupingMode: SidebarProjectGroupingMode;
}

export function savedProjectKeys(filters: ThreadListFilters | undefined): readonly string[] {
  if (filters === undefined) return [];
  return filters.projectKeys ?? (filters.projectKey === null ? [] : [filters.projectKey]);
}

function defaultHomeListOptions(filters?: ThreadListFilters): HomeListOptions {
  return {
    selectedEnvironmentId: filters?.environmentId ?? null,
    selectedProjectKeys: savedProjectKeys(filters),
    projectSortOrder:
      DEFAULT_SIDEBAR_PROJECT_SORT_ORDER === "manual"
        ? "updated_at"
        : DEFAULT_SIDEBAR_PROJECT_SORT_ORDER,
  };
}

interface HomeListOptionsContextValue {
  readonly options: HomeListOptions;
  readonly updateOptions: (patch: Partial<HomeListOptions>) => void;
  readonly projectGroupingMode: SidebarProjectGroupingMode;
}

const HomeListOptionsContext = createContext<HomeListOptionsContextValue | null>(null);

export function HomeListOptionsProvider({
  children,
  projectGroupingMode,
  savedFilters,
}: PropsWithChildren<{
  readonly projectGroupingMode: SidebarProjectGroupingMode;
  readonly savedFilters?: ThreadListFilters | undefined;
}>) {
  const registry = useContext(RegistryContext);
  const [optionsAtom] = useState(() => Atom.make(defaultHomeListOptions(savedFilters)));
  const options = useAtomValue(optionsAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  // Only the scope persists; the sort order is per session. Updates read the
  // registry, so several in one event each build on the last and save it.
  const updateOptions = (patch: Partial<HomeListOptions>) => {
    const current = registry.get(optionsAtom);
    const next = { ...current, ...patch };
    registry.set(optionsAtom, next);
    if (
      next.selectedEnvironmentId !== current.selectedEnvironmentId ||
      next.selectedProjectKeys.length !== current.selectedProjectKeys.length ||
      next.selectedProjectKeys.some((key, index) => key !== current.selectedProjectKeys[index])
    ) {
      savePreferences({
        threadListFilters: {
          environmentId: next.selectedEnvironmentId,
          projectKey: next.selectedProjectKeys.length === 1 ? next.selectedProjectKeys[0]! : null,
          projectKeys: next.selectedProjectKeys,
        },
      });
    }
  };
  const value = { options, updateOptions, projectGroupingMode };
  return createElement(HomeListOptionsContext, { value }, children);
}

export function useHomeListOptions(availableEnvironmentIds: ReadonlySet<EnvironmentId>) {
  const shared = useContext(HomeListOptionsContext);
  const [localOptions, setLocalOptions] = useState<HomeListOptions>(defaultHomeListOptions);
  const options = shared?.options ?? localOptions;
  const updateOptions =
    shared?.updateOptions ??
    ((patch: Partial<HomeListOptions>) => setLocalOptions((current) => ({ ...current, ...patch })));
  const selectedEnvironmentId =
    options.selectedEnvironmentId !== null &&
    availableEnvironmentIds.has(options.selectedEnvironmentId)
      ? options.selectedEnvironmentId
      : null;
  const availableOptions =
    selectedEnvironmentId === options.selectedEnvironmentId
      ? options
      : { ...options, selectedEnvironmentId };
  const resolvedOptions: ResolvedHomeListOptions = {
    ...availableOptions,
    projectGroupingMode: shared?.projectGroupingMode ?? "repository",
  };

  const setSelectedEnvironmentId = (value: EnvironmentId | null) => {
    updateOptions({ selectedEnvironmentId: value });
  };
  const setSelectedProjectKeys = (value: readonly string[]) => {
    updateOptions({ selectedProjectKeys: value });
  };
  const setProjectSortOrder = (value: HomeProjectSortOrder) => {
    updateOptions({ projectSortOrder: value });
  };
  return {
    options: resolvedOptions,
    setSelectedEnvironmentId,
    setSelectedProjectKeys,
    setProjectSortOrder,
  } as const;
}

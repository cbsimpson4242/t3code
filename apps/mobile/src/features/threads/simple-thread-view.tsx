import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { Pressable, View } from "react-native";
import type { ReactNode } from "react";
import { AppText } from "../../components/ui/AppText";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";

export function useSimpleThreadView() {
  const result = useAtomValue(mobilePreferencesAtom);
  return AsyncResult.isSuccess(result) && result.value.threadListView === "simple";
}

export function ThreadViewToggle() {
  const simple = useSimpleThreadView();
  const save = useAtomSet(updateMobilePreferencesAtom);
  const result = useAtomValue(mobilePreferencesAtom);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel="Simple thread tiles"
      accessibilityState={{ checked: simple, disabled: !AsyncResult.isSuccess(result) }}
      disabled={!AsyncResult.isSuccess(result)}
      onPress={() =>
        save({
          transform: (current) => ({
            threadListView: current.threadListView === "simple" ? "standard" : "simple",
          }),
        })
      }
      className="self-end rounded-xl bg-surface px-4 py-3"
      style={{ minHeight: 48, minWidth: 80 }}
    >
      <AppText className="text-sm text-foreground">{simple ? "List view" : "Simple view"}</AppText>
    </Pressable>
  );
}

export function SimpleGridCells<T extends { readonly key: string }>(props: {
  readonly cells: readonly T[];
  readonly columns: number;
  readonly render: (item: T) => ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 8, gap: 8, marginBottom: 8 }}>
      {props.cells.map((cell) => (
        <View key={cell.key} style={{ flex: 1, minWidth: 0 }}>
          {props.render(cell)}
        </View>
      ))}
      {Array.from({ length: props.columns - props.cells.length }, (_, index) => (
        <View key={`space-${index}`} style={{ flex: 1 }} />
      ))}
    </View>
  );
}

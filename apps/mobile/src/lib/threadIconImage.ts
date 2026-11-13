import { THREAD_ICON_IMAGE_SIZE_PX } from "@t3tools/contracts";
import {
  threadIconImageFits,
  validateThreadIconSourceFile,
} from "@t3tools/client-runtime/state/thread-icon";

import { beginForegroundHandoff } from "./foreground-handoff";

const JPEG_QUALITIES = [0.8, 0.55, 0.35] as const;

export type ThreadIconImagePick =
  | { readonly kind: "picked"; readonly dataUrl: string }
  | { readonly kind: "cancelled" }
  | { readonly kind: "error"; readonly message: string };

/** Picks a photo, crops it to a centered square and re-encodes it small enough to store on the thread. */
export async function pickThreadIconImage(): Promise<ThreadIconImagePick> {
  try {
    const picker = await import("expo-image-picker");
    const endHandoff = beginForegroundHandoff();
    let result: Awaited<ReturnType<typeof picker.launchImageLibraryAsync>>;
    try {
      result = await picker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        base64: false,
        quality: 1,
        shouldDownloadFromNetwork: true,
      });
    } finally {
      endHandoff();
    }
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset === undefined) return { kind: "cancelled" };
    const rejection = validateThreadIconSourceFile({
      type: asset.mimeType?.toLowerCase() ?? "image/jpeg",
      size: asset.fileSize ?? 0,
    });
    if (rejection !== null) return { kind: "error", message: rejection };

    const { ImageManipulator, SaveFormat } = await import("expo-image-manipulator");
    const side = Math.min(asset.width, asset.height);
    const source = await ImageManipulator.manipulate(asset.uri).renderAsync();
    try {
      const square = ImageManipulator.manipulate(source).crop({
        originX: Math.floor((asset.width - side) / 2),
        originY: Math.floor((asset.height - side) / 2),
        width: side,
        height: side,
      });
      const resized = await square
        .resize({ width: THREAD_ICON_IMAGE_SIZE_PX, height: THREAD_ICON_IMAGE_SIZE_PX })
        .renderAsync();
      try {
        for (const compress of JPEG_QUALITIES) {
          const saved = await resized.saveAsync({
            format: SaveFormat.JPEG,
            compress,
            base64: true,
          });
          const dataUrl = saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : null;
          if (dataUrl !== null && threadIconImageFits(dataUrl)) {
            return { kind: "picked", dataUrl };
          }
        }
        return { kind: "error", message: "That image is too detailed to use as an icon." };
      } finally {
        resized.release();
      }
    } finally {
      source.release();
    }
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "That image could not be used.",
    };
  }
}

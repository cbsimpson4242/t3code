import { THREAD_ICON_IMAGE_SIZE_PX } from "@t3tools/contracts";
import {
  threadIconImageFits,
  validateThreadIconSourceFile,
} from "@t3tools/client-runtime/state/thread-icon";

const ENCODE_ATTEMPTS = [
  { size: THREAD_ICON_IMAGE_SIZE_PX, quality: 0.85 },
  { size: THREAD_ICON_IMAGE_SIZE_PX, quality: 0.6 },
  { size: 96, quality: 0.6 },
  { size: 64, quality: 0.5 },
] as const;

/** Crops the image to a centered square and re-encodes it small enough to store on the thread. */
export async function threadIconImageFromFile(file: File): Promise<string> {
  const rejection = validateThreadIconSourceFile(file);
  if (rejection !== null) throw new Error(rejection);
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("That image could not be read.");
  });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const sourceX = (bitmap.width - side) / 2;
    const sourceY = (bitmap.height - side) / 2;
    const canvas = document.createElement("canvas");
    for (const { size, quality } of ENCODE_ATTEMPTS) {
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) break;
      context.clearRect(0, 0, size, size);
      context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, size, size);
      const dataUrl = canvas.toDataURL("image/webp", quality);
      if (/^data:image\/(?:png|jpeg|webp);base64,/.test(dataUrl) && threadIconImageFits(dataUrl)) {
        return dataUrl;
      }
    }
    throw new Error("That image is too detailed to use as an icon.");
  } finally {
    bitmap.close();
  }
}

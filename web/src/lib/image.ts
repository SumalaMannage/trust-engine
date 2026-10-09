import { LIMITS } from "@/lib/config";
import type { ImageMime } from "@/lib/api/types";

export const ACCEPTED_IMAGE_TYPES: ImageMime[] = ["image/jpeg", "image/png", "image/webp"];
const MAX_EDGE = 1600;

export interface PreparedImage {
  name: string;
  mime: ImageMime;
  base64: string;     // raw base64, no data: prefix
  bytes: number;
}

export class ImageError extends Error {}

function isAccepted(type: string): type is ImageMime {
  return (ACCEPTED_IMAGE_TYPES as string[]).includes(type);
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function shrink(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= LIMITS.imageBytes) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Reads a screenshot or payment slip for the check. Large photos are scaled to 1600 px on the long
 * edge so uploads stay fast on mobile data and under the 5 MB limit the server checks after decoding.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (/heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)) {
    throw new ImageError("HEIC is not supported. Take a screenshot or export the image as JPG, then choose JPEG, PNG or WEBP.");
  }
  if (!isAccepted(file.type)) {
    throw new ImageError("This file type is not supported. Choose a JPEG, PNG or WEBP image already on your device.");
  }
  const blob = await shrink(file);
  if (!blob) throw new ImageError("This image is empty or could not be decoded. Choose a valid JPEG, PNG or WEBP image, 5 MB or less after decoding.");
  if (blob.size > LIMITS.imageBytes) {
    throw new ImageError(`${file.name} is ${mb(blob.size)}. Each decoded image must be 5 MB or less. Choose a smaller screenshot or resize this image, then try again.`);
  }
  const mime: ImageMime = blob === file ? (file.type as ImageMime) : "image/jpeg";
  return { name: file.name, mime, base64: toBase64(await blob.arrayBuffer()), bytes: blob.size };
}

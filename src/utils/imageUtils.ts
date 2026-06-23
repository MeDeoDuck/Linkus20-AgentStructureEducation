import type { ImageElement } from "../types";
import { CANVAS_H, CANVAS_W } from "./anchors";

/** Raster formats only — SVG is intentionally excluded (export/XSS safety). */
const SUPPORTED = ["image/png", "image/jpeg", "image/webp"];
export const ACCEPT_ATTR = SUPPORTED.join(",");

/** Cap the longest edge so base64 dataURLs stay reasonably small. */
const MAX_DIM = 1600;

export function isSupportedImage(type: string): boolean {
  return SUPPORTED.includes(type);
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadAndDownscale(
  dataUrl: string
): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const nw = img.naturalWidth || 200;
      const nh = img.naturalHeight || 200;
      const scale = Math.min(1, MAX_DIM / Math.max(nw, nh));
      const w = Math.max(1, Math.round(nw * scale));
      const h = Math.max(1, Math.round(nh * scale));
      if (scale >= 1) {
        resolve({ src: dataUrl, width: w, height: h });
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve({ src: dataUrl, width: w, height: h });
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ src: canvas.toDataURL("image/png"), width: w, height: h });
    };
    img.onerror = () => resolve({ src: dataUrl, width: 200, height: 200 });
    img.src = dataUrl;
  });
}

/**
 * Turn an uploaded/pasted File into an ImageElement positioned (centered) at the
 * given canvas point. Uses a dataURL so the image survives PNG export with no
 * CORS taint. Returns null for unsupported types.
 */
export async function fileToImageElement(
  file: File,
  center: { x: number; y: number }
): Promise<ImageElement | null> {
  if (!isSupportedImage(file.type)) return null;
  const dataUrl = await readAsDataUrl(file);
  const { src, width, height } = await loadAndDownscale(dataUrl);
  const x = clamp(Math.round(center.x - width / 2), 0, CANVAS_W - width);
  const y = clamp(Math.round(center.y - height / 2), 0, CANVAS_H - height);
  return {
    id: crypto.randomUUID(),
    type: "image",
    x,
    y,
    width,
    height,
    src,
    fileName: file.name,
    aspectRatio: width / height,
    zIndex: 0, // addImageElement 가 추가 시점에 nextZ 로 덮어씀
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), Math.max(min, max));
}

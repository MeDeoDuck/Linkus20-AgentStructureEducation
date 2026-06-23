import { toPng } from "html-to-image";
import { CANVAS_H, CANVAS_W } from "./anchors";

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
}

interface FileSystemWritable {
  write: (data: Blob) => Promise<void>;
  close: () => Promise<void>;
}

interface FileSystemFileHandleLike {
  createWritable: () => Promise<FileSystemWritable>;
}

type ShowSaveFilePicker = (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandleLike>;

function sanitizeFilename(name: string, suffix = ""): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]/g, "_");
  return (cleaned || "구조도") + suffix + ".png";
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/**
 * Draw a source PNG (data URL) into a fixed-size canvas using "contain"
 * scaling: aspect ratio preserved, centered, letterboxed on white. Keeps the
 * diagram from being squished when the target ratio differs from the canvas.
 */
async function resizeContain(
  sourceDataUrl: string,
  targetW: number,
  targetH: number,
): Promise<string> {
  const img = new Image();
  img.src = sourceDataUrl;
  await img.decode();

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D 컨텍스트를 생성할 수 없습니다.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);

  const scale = Math.min(targetW / img.width, targetH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const dx = (targetW - drawW) / 2;
  const dy = (targetH - drawH) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, dx, dy, drawW, drawH);

  return canvas.toDataURL("image/png");
}

/** Save a PNG data URL via File System Access API, falling back to <a download>. */
async function savePngDataUrl(dataUrl: string, filename: string): Promise<void> {
  const picker = (window as unknown as { showSaveFilePicker?: ShowSaveFilePicker })
    .showSaveFilePicker;

  if (typeof picker === "function") {
    try {
      const handle = await picker({
        suggestedName: filename,
        types: [{ description: "PNG Image", accept: { "image/png": [".png"] } }],
      });
      const blob = await dataUrlToBlob(dataUrl);
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // User cancelled the picker — abort silently.
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Otherwise fall through to anchor download.
    }
  }

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export interface ExportOptions {
  /** When set, the captured canvas is letterboxed into this exact pixel size. */
  fit?: { width: number; height: number };
  /** Filename suffix before ".png" (e.g. "_1080x1440"). */
  suffix?: string;
}

/**
 * Capture only the canvas DOM node (excludes sidebar/topbar/modals) and save as PNG.
 * With `options.fit`, the result is resized (contain) to that exact size.
 */
export async function exportCanvasToPng(
  node: HTMLElement,
  title: string,
  options: ExportOptions = {},
): Promise<void> {
  const filename = sanitizeFilename(title, options.suffix);

  let dataUrl = await toPng(node, {
    cacheBust: true,
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    // 줌(transform: scale) 무시하고 원본 2400x1600 으로 캡처.
    width: CANVAS_W,
    height: CANVAS_H,
    style: { transform: "none", transformOrigin: "0 0" },
    // Skip any element flagged as no-export (selection handles, etc.)
    filter: (el) => {
      if (el instanceof HTMLElement && el.dataset.noExport === "true") return false;
      return true;
    },
  });

  if (options.fit) {
    dataUrl = await resizeContain(dataUrl, options.fit.width, options.fit.height);
  }

  await savePngDataUrl(dataUrl, filename);
}

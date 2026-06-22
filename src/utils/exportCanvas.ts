import { toPng } from "html-to-image";

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

function sanitizeFilename(name: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]/g, "_");
  return (cleaned || "구조도") + ".png";
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

/**
 * Capture only the canvas DOM node (excludes sidebar/topbar/modals) and save as PNG.
 * Uses File System Access API when available, otherwise an <a download> fallback.
 */
export async function exportCanvasToPng(node: HTMLElement, title: string): Promise<void> {
  const filename = sanitizeFilename(title);

  const dataUrl = await toPng(node, {
    cacheBust: true,
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    // Skip any element flagged as no-export (selection handles, etc.)
    filter: (el) => {
      if (el instanceof HTMLElement && el.dataset.noExport === "true") return false;
      return true;
    },
  });

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

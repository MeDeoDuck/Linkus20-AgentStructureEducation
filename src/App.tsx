import { useCallback, useEffect, useRef, useState } from "react";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import Canvas from "./components/Canvas";
import LogoPickerBottomSheet from "./components/LogoPickerBottomSheet";
import { useDiagramStore } from "./store/useDiagramStore";
import { exportCanvasToPng } from "./utils/exportCanvas";
import { fileToImageElement } from "./utils/imageUtils";
import { CANVAS_H, CANVAS_W } from "./utils/anchors";

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  const title = useDiagramStore((s) => s.title);
  const deleteSelected = useDiagramStore((s) => s.deleteSelected);
  const selectedId = useDiagramStore((s) => s.selectedId);
  const clearSelection = useDiagramStore((s) => s.clearSelection);
  const addImageElement = useDiagramStore((s) => s.addImageElement);

  // Delete / Backspace removes the selected element — unless focus is in an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, selectedId, clearSelection]);

  // Ctrl+V image paste — insert the clipboard image at the canvas center.
  useEffect(() => {
    const onPaste = async (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            const el = await fileToImageElement(file, { x: CANVAS_W / 2, y: CANVAS_H / 2 });
            if (el) addImageElement(el);
          }
          break;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [addImageElement]);

  const handleSave = useCallback(async () => {
    if (!canvasRef.current) return;
    setSaving(true);
    // Hide selection visuals during capture.
    clearSelection();
    try {
      // Let React flush the deselection before capturing.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      await exportCanvasToPng(canvasRef.current, title);
    } catch (err) {
      console.error("저장 실패:", err);
      alert("저장에 실패했습니다. 콘솔을 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  }, [title, clearSelection]);

  return (
    <div className="app">
      <TopBar onSave={handleSave} saving={saving} />
      <div className="app__body">
        <Sidebar />
        <Canvas ref={canvasRef} />
      </div>
      <LogoPickerBottomSheet />
    </div>
  );
}

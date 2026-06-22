import { useCallback, useEffect, useRef, useState } from "react";
import TopBar from "./components/TopBar";
import Sidebar from "./components/Sidebar";
import Canvas from "./components/Canvas";
import { useDiagramStore } from "./store/useDiagramStore";
import { exportCanvasToPng } from "./utils/exportCanvas";

export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  const title = useDiagramStore((s) => s.title);
  const deleteSelected = useDiagramStore((s) => s.deleteSelected);
  const selectedId = useDiagramStore((s) => s.selectedId);
  const clearSelection = useDiagramStore((s) => s.clearSelection);

  // Delete / Backspace removes the selected element — unless focus is in an input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteSelected, selectedId, clearSelection]);

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
    </div>
  );
}

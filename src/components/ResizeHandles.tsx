import type { DiagramBlock } from "../types";
import { useDiagramStore } from "../store/useDiagramStore";
import {
  SMART_SNAP_THRESHOLD,
  calculateSmartSnapOnResize,
  collectBounds,
} from "../utils/smartGuides";

interface ResizeHandlesProps {
  block: DiagramBlock;
}

type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLES: { dir: HandleDir; cursor: string; fx: number; fy: number }[] = [
  { dir: "nw", cursor: "nwse-resize", fx: 0, fy: 0 },
  { dir: "n", cursor: "ns-resize", fx: 0.5, fy: 0 },
  { dir: "ne", cursor: "nesw-resize", fx: 1, fy: 0 },
  { dir: "e", cursor: "ew-resize", fx: 1, fy: 0.5 },
  { dir: "se", cursor: "nwse-resize", fx: 1, fy: 1 },
  { dir: "s", cursor: "ns-resize", fx: 0.5, fy: 1 },
  { dir: "sw", cursor: "nesw-resize", fx: 0, fy: 1 },
  { dir: "w", cursor: "ew-resize", fx: 0, fy: 0.5 },
];

const MIN = 40;

export default function ResizeHandles({ block }: ResizeHandlesProps) {
  const resizeBlock = useDiagramStore((s) => s.resizeBlock);
  const setSmartGuides = useDiagramStore((s) => s.setSmartGuides);
  const clearSmartGuides = useDiagramStore((s) => s.clearSmartGuides);
  const beginHistory = useDiagramStore((s) => s.beginHistory);

  const startResize = (dir: HandleDir) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { x: block.x, y: block.y, width: block.width, height: block.height };
    let begun = false;

    const onMove = (ev: PointerEvent) => {
      if (!begun) {
        beginHistory();
        begun = true;
      }
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      let { x, y, width, height } = orig;

      if (dir.includes("e")) width = Math.max(MIN, orig.width + dx);
      if (dir.includes("s")) height = Math.max(MIN, orig.height + dy);
      if (dir.includes("w")) {
        width = Math.max(MIN, orig.width - dx);
        x = orig.x + (orig.width - width);
      }
      if (dir.includes("n")) {
        height = Math.max(MIN, orig.height - dy);
        y = orig.y + (orig.height - height);
      }

      // Smart alignment: snap the active edge(s) to other objects' edges/centers
      // or equal width/height, and surface guide lines.
      const st = useDiagramStore.getState();
      const others = collectBounds(st.blocks, st.images, block.id);
      const snapped = calculateSmartSnapOnResize(
        { id: block.id, x, y, width, height },
        dir,
        others,
        SMART_SNAP_THRESHOLD
      );
      x = snapped.x;
      y = snapped.y;
      width = snapped.width;
      height = snapped.height;
      setSmartGuides(snapped.guides);

      // Clamp within the canvas bounds (2400 x 1600).
      x = Math.max(0, x);
      y = Math.max(0, y);
      width = Math.min(width, 2400 - x);
      height = Math.min(height, 1600 - y);
      resizeBlock(block.id, { x, y, width, height });
    };

    const onUp = () => {
      clearSmartGuides();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <>
      {HANDLES.map((h) => (
        <div
          key={h.dir}
          className="resize-handle"
          data-no-export="true"
          style={{
            left: `calc(${h.fx * 100}% - 4.5px)`,
            top: `calc(${h.fy * 100}% - 4.5px)`,
            cursor: h.cursor,
          }}
          onPointerDown={startResize(h.dir)}
        />
      ))}
    </>
  );
}

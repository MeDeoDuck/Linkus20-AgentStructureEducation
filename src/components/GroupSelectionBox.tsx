import { useDiagramStore } from "../store/useDiagramStore";
import { getSelectionRect } from "../utils/selection";
import { useSelectionGestures } from "../hooks/useSelectionGestures";

type Dir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLES: { dir: Dir; cursor: string; fx: number; fy: number }[] = [
  { dir: "nw", cursor: "nwse-resize", fx: 0, fy: 0 },
  { dir: "n", cursor: "ns-resize", fx: 0.5, fy: 0 },
  { dir: "ne", cursor: "nesw-resize", fx: 1, fy: 0 },
  { dir: "e", cursor: "ew-resize", fx: 1, fy: 0.5 },
  { dir: "se", cursor: "nwse-resize", fx: 1, fy: 1 },
  { dir: "s", cursor: "ns-resize", fx: 0.5, fy: 1 },
  { dir: "sw", cursor: "nesw-resize", fx: 0, fy: 1 },
  { dir: "w", cursor: "ew-resize", fx: 0, fy: 0.5 },
];

/** The bounding box + resize handles shown when 2+ objects are selected. */
export default function GroupSelectionBox() {
  const selection = useDiagramStore((s) => s.selection);
  const blocks = useDiagramStore((s) => s.blocks);
  const images = useDiagramStore((s) => s.images);
  const arrows = useDiagramStore((s) => s.arrows);
  const { startResize } = useSelectionGestures();

  if (selection.length < 2) return null;
  const rect = getSelectionRect(selection, { blocks, images, arrows });
  if (!rect) return null;

  return (
    <>
      {/* Visual box only (pointer-events:none) — group move is handled by dragging
          any selected element. Handles below opt back in for resizing. */}
      <div
        className="group-selection-box"
        style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
        data-no-export="true"
      />
      {HANDLES.map((h) => (
        <div
          key={h.dir}
          className="group-selection-handle"
          data-no-export="true"
          style={{
            left: rect.x + h.fx * rect.width - 4,
            top: rect.y + h.fy * rect.height - 4,
            cursor: h.cursor,
          }}
          onPointerDown={(e) => startResize(h.dir, e)}
        />
      ))}
    </>
  );
}

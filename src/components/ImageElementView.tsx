import type { ImageElement } from "../types";
import { useDiagramStore } from "../store/useDiagramStore";
import { CANVAS_H, CANVAS_W } from "../utils/anchors";
import {
  SMART_SNAP_THRESHOLD,
  calculateSmartSnapOnMove,
  calculateSmartSnapOnResize,
  collectBounds,
  getElementBounds,
} from "../utils/smartGuides";

interface ImageElementViewProps {
  img: ImageElement;
}

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

const MIN = 20;

export default function ImageElementView({ img }: ImageElementViewProps) {
  const selectedId = useDiagramStore((s) => s.selectedId);
  const selectedKind = useDiagramStore((s) => s.selectedKind);
  const select = useDiagramStore((s) => s.select);
  const updateImageElement = useDiagramStore((s) => s.updateImageElement);
  const setSmartGuides = useDiagramStore((s) => s.setSmartGuides);
  const clearSmartGuides = useDiagramStore((s) => s.clearSmartGuides);

  const selected = selectedKind === "image" && selectedId === img.id;

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    select(img.id, "image");
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = img.x;
    const oy = img.y;
    const onMove = (ev: PointerEvent) => {
      // Read latest state each frame (avoid stale-closure snap targets/dims).
      const st = useDiagramStore.getState();
      const cur = st.images.find((im) => im.id === img.id);
      const w = cur?.width ?? img.width;
      const h = cur?.height ?? img.height;
      let nx = Math.min(Math.max(0, ox + (ev.clientX - sx)), CANVAS_W - w);
      let ny = Math.min(Math.max(0, oy + (ev.clientY - sy)), CANVAS_H - h);

      const moving = getElementBounds({ id: img.id, x: nx, y: ny, width: w, height: h });
      const others = collectBounds(st.blocks, st.images, img.id);
      const { dx, dy, guides } = calculateSmartSnapOnMove(moving, others, SMART_SNAP_THRESHOLD);
      nx = Math.min(Math.max(0, nx + dx), CANVAS_W - w);
      ny = Math.min(Math.max(0, ny + dy), CANVAS_H - h);
      setSmartGuides(guides);

      updateImageElement(img.id, { x: nx, y: ny });
    };
    const onUp = () => {
      clearSmartGuides();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startResize = (dir: Dir) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    select(img.id, "image");
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { x: img.x, y: img.y, width: img.width, height: img.height };
    const ar = img.aspectRatio || orig.width / orig.height || 1;
    const isCorner = dir.length === 2;

    const onMove = (ev: PointerEvent) => {
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

      // Corner handles keep the aspect ratio; edge handles stretch freely.
      if (isCorner) {
        height = Math.max(MIN, width / ar);
        if (dir.includes("n")) y = orig.y + (orig.height - height);
      }

      // Smart alignment on single-axis (edge) resize only — corner keeps aspect,
      // so size/edge snapping is skipped there to avoid fighting the ratio lock.
      if (!isCorner) {
        const st = useDiagramStore.getState();
        const others = collectBounds(st.blocks, st.images, img.id);
        const snapped = calculateSmartSnapOnResize(
          { id: img.id, x, y, width, height },
          dir,
          others,
          SMART_SNAP_THRESHOLD
        );
        x = snapped.x;
        y = snapped.y;
        width = snapped.width;
        height = snapped.height;
        setSmartGuides(snapped.guides);
      } else {
        clearSmartGuides();
      }

      x = Math.max(0, x);
      y = Math.max(0, y);
      width = Math.min(width, CANVAS_W - x);
      height = Math.min(height, CANVAS_H - y);
      updateImageElement(img.id, { x, y, width, height });
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
    <div
      className={`image-el${selected ? " image-el--selected" : ""}`}
      style={{ left: img.x, top: img.y, width: img.width, height: img.height }}
      onPointerDown={onPointerDown}
    >
      <img className="image-el__img" src={img.src} alt={img.fileName ?? ""} draggable={false} />
      {selected &&
        HANDLES.map((h) => (
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
    </div>
  );
}

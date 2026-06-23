import { useDiagramStore } from "../store/useDiagramStore";
import { useViewportStore } from "../store/useViewportStore";
import { getSelectionRect, type Rect } from "../utils/selection";
import {
  SMART_SNAP_THRESHOLD,
  calculateSmartSnapOnMove,
  getElementBounds,
  type Bounds,
} from "../utils/smartGuides";

const MIN_GROUP_W = 40;
const MIN_GROUP_H = 40;

type Dir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/** Bounds of every block/image NOT in the current selection (smart-guide targets). */
function unselectedBounds(): Bounds[] {
  const st = useDiagramStore.getState();
  const sel = new Set(st.selection.map((r) => `${r.type}:${r.id}`));
  return [
    ...st.blocks.filter((b) => !sel.has(`block:${b.id}`)).map(getElementBounds),
    ...st.images.filter((im) => !sel.has(`image:${im.id}`)).map(getElementBounds),
  ];
}

export interface SelectionGestures {
  startMove: (e: React.PointerEvent) => void;
  startResize: (dir: Dir, e: React.PointerEvent) => void;
}

/** Pointer wiring for moving / resizing the whole multi-selection (canvas px === screen px). */
export function useSelectionGestures(): SelectionGestures {
  const moveSelection = useDiagramStore((s) => s.moveSelection);
  const applyGroupResize = useDiagramStore((s) => s.applyGroupResize);
  const setSmartGuides = useDiagramStore((s) => s.setSmartGuides);
  const clearSmartGuides = useDiagramStore((s) => s.clearSmartGuides);
  const beginHistory = useDiagramStore((s) => s.beginHistory);

  const startMove = (e: React.PointerEvent) => {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const st = useDiagramStore.getState();
    const before = getSelectionRect(st.selection, st);
    if (!before) return;
    const others = unselectedBounds();
    const zoom = useViewportStore.getState().zoom;
    let lastDx = 0;
    let lastDy = 0;
    let begun = false;

    const onMove = (ev: PointerEvent) => {
      const rawDx = (ev.clientX - startX) / zoom;
      const rawDy = (ev.clientY - startY) / zoom;
      if (!begun && (Math.abs(rawDx) > 2 || Math.abs(rawDy) > 2)) {
        beginHistory();
        begun = true;
      }
      const moving = getElementBounds({
        id: "__selection__",
        x: before.x + rawDx,
        y: before.y + rawDy,
        width: before.width,
        height: before.height,
      });
      const { dx: sdx, dy: sdy, guides } = calculateSmartSnapOnMove(moving, others, SMART_SNAP_THRESHOLD);
      const finalDx = rawDx + sdx;
      const finalDy = rawDy + sdy;
      moveSelection(finalDx - lastDx, finalDy - lastDy);
      lastDx = finalDx;
      lastDy = finalDy;
      setSmartGuides(guides);
    };
    const onUp = () => {
      clearSmartGuides();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startResize = (dir: Dir, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const st = useDiagramStore.getState();
    const before = getSelectionRect(st.selection, st);
    if (!before) return;
    const origin = { blocks: st.blocks, arrows: st.arrows, images: st.images };
    const ratio = before.height ? before.width / before.height : 1;
    const zoom = useViewportStore.getState().zoom;
    let begun = false;

    const onMove = (ev: PointerEvent) => {
      if (!begun) {
        beginHistory();
        begun = true;
      }
      const dx = (ev.clientX - startX) / zoom;
      const dy = (ev.clientY - startY) / zoom;
      let { x, y, width, height } = before;
      if (dir.includes("e")) width = Math.max(MIN_GROUP_W, before.width + dx);
      if (dir.includes("w")) {
        width = Math.max(MIN_GROUP_W, before.width - dx);
        x = before.x + before.width - width;
      }
      if (dir.includes("s")) height = Math.max(MIN_GROUP_H, before.height + dy);
      if (dir.includes("n")) {
        height = Math.max(MIN_GROUP_H, before.height - dy);
        y = before.y + before.height - height;
      }

      // Shift on a corner handle keeps the group aspect ratio.
      if (ev.shiftKey && dir.length === 2) {
        height = Math.max(MIN_GROUP_H, width / ratio);
        if (dir.includes("n")) y = before.y + before.height - height;
      }

      const after: Rect = { x, y, width, height };
      applyGroupResize(origin, before, after);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return { startMove, startResize };
}

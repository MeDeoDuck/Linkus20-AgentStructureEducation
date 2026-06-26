import type { ArrowElement as Arrow } from "../types";
import { useDiagramStore } from "../store/useDiagramStore";
import {
  arrowEndPoint,
  arrowStartPoint,
  clientToCanvas,
  endpointsToArrow,
  findNearestAnchor,
  SNAP_THRESHOLD,
} from "../utils/anchors";
import { isRefSelected } from "../utils/selection";
import { useSelectionGestures } from "../hooks/useSelectionGestures";
import { useViewportStore } from "../store/useViewportStore";

interface ArrowElementProps {
  arrow: Arrow;
}

/**
 * Arrow geometry (local coords, origin = start anchor at (0,0)):
 *  - Base line runs from start (0,0) to (width,0).
 *  - The whole group is positioned via `translate(arrow.x, arrow.y)` and rotated
 *    via `rotate(arrow.rotation)` around that origin (pivot = (0,0)).
 *  - `curve` lifts a quadratic Bezier control point perpendicular to the midpoint.
 *
 * Endpoint editing uses TWO free endpoints in canvas space: the start handle
 * moves the start point (end fixed), the end handle moves the end point (start
 * fixed). Each endpoint snaps to nearby block anchors; geometry is re-derived
 * through `endpointsToArrow` so width/rotation never drift. `curve` is kept as an
 * absolute perpendicular offset, so the bend magnitude is preserved on drag.
 */
export default function ArrowElement({ arrow }: ArrowElementProps) {
  const blocks = useDiagramStore((s) => s.blocks);
  const selection = useDiagramStore((s) => s.selection);
  const select = useDiagramStore((s) => s.select);
  const toggleSelection = useDiagramStore((s) => s.toggleSelection);
  const moveArrow = useDiagramStore((s) => s.moveArrow);
  const updateArrow = useDiagramStore((s) => s.updateArrow);
  const updateArrowConnection = useDiagramStore((s) => s.updateArrowConnection);
  const beginHistory = useDiagramStore((s) => s.beginHistory);
  const { startMove } = useSelectionGestures();

  const selected = isRefSelected({ type: "arrow", id: arrow.id }, selection);
  const isOnly = selected && selection.length === 1;

  const openContextMenu = useViewportStore((s) => s.openContextMenu);
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ref = { type: "arrow" as const, id: arrow.id };
    if (!isRefSelected(ref, useDiagramStore.getState().selection)) select(arrow.id, "arrow");
    openContextMenu(e.clientX, e.clientY, ref);
  };

  // Local endpoints (pivot at origin).
  const x1 = 0;
  const y1 = 0;
  const x2 = arrow.width;
  const y2 = 0;
  const midX = (x1 + x2) / 2;
  const ctrlY = y1 - arrow.curve; // control point lifted by curve
  const ctrlX = midX;

  // The path: quadratic bezier from start to end via control point.
  const pathD = `M ${x1} ${y1} Q ${ctrlX} ${ctrlY} ${x2} ${y2}`;

  // Arrowhead at the end, oriented along the tangent (end → control).
  const angle = Math.atan2(y2 - ctrlY, x2 - ctrlX);
  const ah = 10;
  const ax = x2;
  const ay = y2;
  const ahx1 = ax - ah * Math.cos(angle - Math.PI / 6);
  const ahy1 = ay - ah * Math.sin(angle - Math.PI / 6);
  const ahx2 = ax - ah * Math.cos(angle + Math.PI / 6);
  const ahy2 = ay - ah * Math.sin(angle + Math.PI / 6);

  // Move the whole arrow (drag the body). Freely repositioning detaches it from
  // any blocks, so both connections are cleared.
  const startBodyDrag = (e: React.PointerEvent) => {
    e.stopPropagation();

    if (e.shiftKey) {
      toggleSelection({ type: "arrow", id: arrow.id });
      return;
    }
    const ref = { type: "arrow" as const, id: arrow.id };
    let sel = useDiagramStore.getState().selection;
    if (!isRefSelected(ref, sel)) {
      select(arrow.id, "arrow");
      sel = useDiagramStore.getState().selection;
    }
    if (sel.length > 1) {
      startMove(e);
      return;
    }

    const sx = e.clientX;
    const sy = e.clientY;
    const ox = arrow.x;
    const oy = arrow.y;
    const zoom = useViewportStore.getState().zoom;
    let detached = false;
    let begun = false;
    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / zoom;
      const dy = (ev.clientY - sy) / zoom;
      // Only detach once the user actually drags (not on a select-click), so a
      // connected arrow isn't unhooked by a stray tap.
      if (!detached && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        detached = true;
        if (!begun) {
          beginHistory();
          begun = true;
        }
        if (arrow.startConnection) updateArrowConnection(arrow.id, "start", undefined);
        if (arrow.endConnection) updateArrowConnection(arrow.id, "end", undefined);
      }
      const nx = Math.min(Math.max(0, ox + dx), 2400);
      const ny = Math.min(Math.max(0, oy + dy), 1600);
      moveArrow(arrow.id, nx, ny);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Drag the END handle: move the end point in 2D (start fixed), snapping to anchors.
  const startEndDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    select(arrow.id, "arrow");
    const svg = (e.currentTarget as SVGGraphicsElement).ownerSVGElement!;
    const fixedStart = arrowStartPoint(arrow);
    let begun = false;
    const onMove = (ev: PointerEvent) => {
      if (!begun) {
        beginHistory();
        begun = true;
      }
      let p = clientToCanvas(svg, ev.clientX, ev.clientY);
      const hit = findNearestAnchor(p, blocks, SNAP_THRESHOLD);
      if (hit) {
        p = hit.point;
        updateArrowConnection(arrow.id, "end", { blockId: hit.blockId, anchor: hit.anchor });
      } else {
        updateArrowConnection(arrow.id, "end", undefined);
      }
      updateArrow(arrow.id, endpointsToArrow(fixedStart, p));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Drag the START handle: move the start point in 2D (end fixed), snapping to anchors.
  const startStartDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    select(arrow.id, "arrow");
    const svg = (e.currentTarget as SVGGraphicsElement).ownerSVGElement!;
    const fixedEnd = arrowEndPoint(arrow);
    let begun = false;
    const onMove = (ev: PointerEvent) => {
      if (!begun) {
        beginHistory();
        begun = true;
      }
      let p = clientToCanvas(svg, ev.clientX, ev.clientY);
      const hit = findNearestAnchor(p, blocks, SNAP_THRESHOLD);
      if (hit) {
        p = hit.point;
        updateArrowConnection(arrow.id, "start", { blockId: hit.blockId, anchor: hit.anchor });
      } else {
        updateArrowConnection(arrow.id, "start", undefined);
      }
      updateArrow(arrow.id, endpointsToArrow(p, fixedEnd));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Drag the CURVE control handle (perpendicular) → curve amount.
  // Rotate the screen delta back into local space; curve responds to the local
  // vertical component (positive curve = lifted upward, i.e. negative local Y).
  const startCurveDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    select(arrow.id, "arrow");
    const sx = e.clientX;
    const sy = e.clientY;
    const oc = arrow.curve;
    const rad = (-arrow.rotation * Math.PI) / 180;
    const zoom = useViewportStore.getState().zoom;
    let begun = false;
    const onMove = (ev: PointerEvent) => {
      if (!begun) {
        beginHistory();
        begun = true;
      }
      const dx = (ev.clientX - sx) / zoom;
      const dy = (ev.clientY - sy) / zoom;
      const localDy = dx * Math.sin(rad) + dy * Math.cos(rad);
      updateArrow(arrow.id, { curve: oc - localDy });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Drag the ROTATE handle: angle from the start anchor (pivot) → rotation deg.
  // Pivot is the group origin = svg layer origin + (arrow.x, arrow.y) in screen
  // space, so convert it correctly instead of comparing local vs viewport coords.
  const startRotateDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    select(arrow.id, "arrow");
    const svg = (e.currentTarget as SVGGraphicsElement).ownerSVGElement!;
    const rect = svg.getBoundingClientRect();
    const sx = rect.width ? 2400 / rect.width : 1;
    const sy = rect.height ? 1600 / rect.height : 1;
    const screenPivotX = rect.left + arrow.x / sx;
    const screenPivotY = rect.top + arrow.y / sy;
    let begun = false;
    const onMove = (ev: PointerEvent) => {
      if (!begun) {
        beginHistory();
        begun = true;
      }
      const ang = Math.atan2(ev.clientY - screenPivotY, ev.clientX - screenPivotX);
      updateArrow(arrow.id, { rotation: (ang * 180) / Math.PI });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Rotate handle local position: a bit above the end point.
  const rotX = x2;
  const rotY = y2 - 22;

  return (
    <svg
      className="arrow-el"
      width={2400}
      height={1600}
      viewBox="0 0 2400 1600"
      style={{ zIndex: arrow.zIndex }}
    >
      <g transform={`translate(${arrow.x},${arrow.y}) rotate(${arrow.rotation})`}>
      {/* Wide invisible hit area for selecting / dragging the body */}
      <path className="arrow-hit" d={pathD} onPointerDown={startBodyDrag} onContextMenu={onContextMenu} />
      <path className={`arrow-line${selected ? " arrow-line--selected" : ""}`} d={pathD} />
      <polygon
        points={`${ax},${ay} ${ahx1},${ahy1} ${ahx2},${ahy2}`}
        fill={selected ? "#2563eb" : "#374151"}
      />
      {arrow.conditionBranch && (
        <text
          x={ctrlX}
          y={ctrlY - 4}
          textAnchor="middle"
          fontSize={12}
          fontWeight={700}
          fill={arrow.conditionBranch === "true" ? "#16a34a" : "#dc2626"}
          style={{ userSelect: "none", pointerEvents: "none" }}
        >
          {arrow.conditionBranch}
        </text>
      )}

      {isOnly && (
        <g data-no-export="true">
          {/* start handle (move start point) — green when snapped to a block */}
          <circle
            className="arrow-handle"
            cx={x1}
            cy={y1}
            r={arrow.startConnection ? 7 : 6}
            fill={arrow.startConnection ? "#16a34a" : undefined}
            stroke={arrow.startConnection ? "#16a34a" : undefined}
            style={{ cursor: "move" }}
            onPointerDown={startStartDrag}
          />
          {/* end handle (move end point) — green when snapped to a block */}
          <circle
            className="arrow-handle"
            cx={x2}
            cy={y2}
            r={arrow.endConnection ? 7 : 6}
            fill={arrow.endConnection ? "#16a34a" : undefined}
            stroke={arrow.endConnection ? "#16a34a" : undefined}
            style={{ cursor: "move" }}
            onPointerDown={startEndDrag}
          />
          {/* curve handle */}
          <rect
            className="arrow-handle"
            x={ctrlX - 5}
            y={ctrlY - 5}
            width={10}
            height={10}
            style={{ cursor: "ns-resize" }}
            onPointerDown={startCurveDrag}
          />
          {/* rotate handle */}
          <circle
            className="arrow-handle arrow-handle--rotate"
            cx={rotX}
            cy={rotY}
            r={6}
            style={{ cursor: "grab" }}
            onPointerDown={startRotateDrag}
          />
        </g>
      )}
      </g>
    </svg>
  );
}

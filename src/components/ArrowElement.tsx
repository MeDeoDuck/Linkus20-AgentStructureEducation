import type { ArrowElement as Arrow } from "../types";
import { useDiagramStore } from "../store/useDiagramStore";

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
 * Because the group is rotated, screen-space pointer deltas must be rotated back
 * into local space before being applied to width/curve (see end/curve handlers).
 */
export default function ArrowElement({ arrow }: ArrowElementProps) {
  const selectedId = useDiagramStore((s) => s.selectedId);
  const selectedKind = useDiagramStore((s) => s.selectedKind);
  const select = useDiagramStore((s) => s.select);
  const moveArrow = useDiagramStore((s) => s.moveArrow);
  const updateArrow = useDiagramStore((s) => s.updateArrow);

  const selected = selectedKind === "arrow" && selectedId === arrow.id;

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

  // Move the whole arrow (drag the body). Plain canvas-space translation.
  const startBodyDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    select(arrow.id, "arrow");
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = arrow.x;
    const oy = arrow.y;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
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

  // Drag the END handle: changes width (length).
  // The group is rotated, so rotate the screen delta back into local space
  // and apply the local horizontal component to the length.
  const startEndDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    select(arrow.id, "arrow");
    const sx = e.clientX;
    const sy = e.clientY;
    const ow = arrow.width;
    const rad = (-arrow.rotation * Math.PI) / 180;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      const localDx = dx * Math.cos(rad) - dy * Math.sin(rad);
      updateArrow(arrow.id, { width: Math.max(40, ow + localDx) });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // Drag the START handle: moves the whole arrow (start anchor).
  const startStartDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
    select(arrow.id, "arrow");
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = arrow.x;
    const oy = arrow.y;
    const onMove = (ev: PointerEvent) => {
      updateArrow(arrow.id, {
        x: Math.min(Math.max(0, ox + (ev.clientX - sx)), 2400),
        y: Math.min(Math.max(0, oy + (ev.clientY - sy)), 1600),
      });
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
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
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
    const screenPivotX = rect.left + arrow.x;
    const screenPivotY = rect.top + arrow.y;
    const onMove = (ev: PointerEvent) => {
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
    <g transform={`translate(${arrow.x},${arrow.y}) rotate(${arrow.rotation})`}>
      {/* Wide invisible hit area for selecting / dragging the body */}
      <path className="arrow-hit" d={pathD} onPointerDown={startBodyDrag} />
      <path className={`arrow-line${selected ? " arrow-line--selected" : ""}`} d={pathD} />
      <polygon
        points={`${ax},${ay} ${ahx1},${ahy1} ${ahx2},${ahy2}`}
        fill={selected ? "#2563eb" : "#374151"}
      />

      {selected && (
        <g data-no-export="true">
          {/* start handle (move anchor) */}
          <circle
            className="arrow-handle"
            cx={x1}
            cy={y1}
            r={6}
            style={{ cursor: "move" }}
            onPointerDown={startStartDrag}
          />
          {/* end handle (length) */}
          <circle
            className="arrow-handle"
            cx={x2}
            cy={y2}
            r={6}
            style={{ cursor: "ew-resize" }}
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
  );
}

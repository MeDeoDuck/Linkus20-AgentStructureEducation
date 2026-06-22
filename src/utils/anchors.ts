import type { AnchorName, ArrowElement, DiagramBlock } from "../types";

/** Canvas grid step (must match index.css `.canvas` background-size). */
export const GRID = 20;
/**
 * Magnetic range for endpoint→anchor snapping. The spec suggested ~grid/4, but
 * at this grid (20px) that's only 5px — far too tight to actually catch, so an
 * endpoint almost never snapped and connections were never stored (which also
 * killed move-follow). Use a usable, draw.io-like magnetic radius instead.
 */
export const SNAP_THRESHOLD = 16;

/** Logical canvas size (must match .canvas width/height in index.css). */
export const CANVAS_W = 2400;
export const CANVAS_H = 1600;

export interface Point {
  x: number;
  y: number;
}

/** All anchor points (8 edges/corners + center) of a block in canvas coords. */
export function getBlockAnchors(block: DiagramBlock): Record<AnchorName, Point> {
  const { x, y, width, height } = block;
  return {
    top: { x: x + width / 2, y },
    right: { x: x + width, y: y + height / 2 },
    bottom: { x: x + width / 2, y: y + height },
    left: { x, y: y + height / 2 },
    "top-left": { x, y },
    "top-right": { x: x + width, y },
    "bottom-left": { x, y: y + height },
    "bottom-right": { x: x + width, y: y + height },
    center: { x: x + width / 2, y: y + height / 2 },
  };
}

export function anchorPoint(block: DiagramBlock, anchor: AnchorName): Point {
  return getBlockAnchors(block)[anchor];
}

// Edge centers get priority over corners (center-alignment snapping).
const EDGE_CENTERS: AnchorName[] = ["top", "right", "bottom", "left"];
const CORNERS: AnchorName[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export interface AnchorHit {
  blockId: string;
  anchor: AnchorName;
  point: Point;
}

/**
 * Find the nearest snap target for a point. Edge-center anchors are considered
 * first across all blocks; if any is within `threshold`, the closest wins.
 * Only if no edge center qualifies do we fall back to corner anchors. The
 * `center` anchor is intentionally excluded from auto-snap (it would pull the
 * arrow into the middle of the shape).
 */
export function findNearestAnchor(
  point: Point,
  blocks: DiagramBlock[],
  threshold: number
): AnchorHit | null {
  const consider = (names: AnchorName[]): AnchorHit | null => {
    let best: AnchorHit | null = null;
    let bestD = threshold;
    for (const block of blocks) {
      const anchors = getBlockAnchors(block);
      for (const anchor of names) {
        const d = dist(point, anchors[anchor]);
        if (d <= bestD) {
          bestD = d;
          best = { blockId: block.id, anchor, point: anchors[anchor] };
        }
      }
    }
    return best;
  };
  return consider(EDGE_CENTERS) ?? consider(CORNERS);
}

/** Current start point of an arrow (the pivot/origin). */
export function arrowStartPoint(arrow: ArrowElement): Point {
  return { x: arrow.x, y: arrow.y };
}

/** Current end point of an arrow, derived from width + rotation. */
export function arrowEndPoint(arrow: ArrowElement): Point {
  const rad = (arrow.rotation * Math.PI) / 180;
  return {
    x: arrow.x + arrow.width * Math.cos(rad),
    y: arrow.y + arrow.width * Math.sin(rad),
  };
}

/**
 * Single source of truth for arrow geometry: derive {x,y,width,rotation} from
 * two canvas-space endpoints. All endpoint edits (drag + reconcile) go through
 * here so width/rotation never drift out of sync. `curve` is preserved by the
 * caller (kept as an absolute perpendicular offset).
 */
export function endpointsToArrow(
  start: Point,
  end: Point
): Pick<ArrowElement, "x" | "y" | "width" | "rotation"> {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const width = Math.hypot(dx, dy);
  const rotation = width === 0 ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI;
  return { x: start.x, y: start.y, width, rotation };
}

/**
 * Recompute a connected arrow's geometry from its anchored block(s). Endpoints
 * without a connection keep their current position. Used after a block moves or
 * resizes so the attached endpoint follows its anchor.
 */
export function reconcileArrow(arrow: ArrowElement, blocks: DiagramBlock[]): ArrowElement {
  if (!arrow.startConnection && !arrow.endConnection) return arrow;
  let start = arrowStartPoint(arrow);
  let end = arrowEndPoint(arrow);
  if (arrow.startConnection) {
    const b = blocks.find((bl) => bl.id === arrow.startConnection!.blockId);
    if (b) start = anchorPoint(b, arrow.startConnection.anchor);
  }
  if (arrow.endConnection) {
    const b = blocks.find((bl) => bl.id === arrow.endConnection!.blockId);
    if (b) end = anchorPoint(b, arrow.endConnection.anchor);
  }
  return { ...arrow, ...endpointsToArrow(start, end) };
}

/** Convert a pointer's screen coords into canvas coords, with scale correction
 *  (the SVG layer is a fixed 2400x1600 but may be rendered at a different size). */
export function clientToCanvas(svg: SVGSVGElement, clientX: number, clientY: number): Point {
  const rect = svg.getBoundingClientRect();
  const sx = rect.width ? CANVAS_W / rect.width : 1;
  const sy = rect.height ? CANVAS_H / rect.height : 1;
  return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
}

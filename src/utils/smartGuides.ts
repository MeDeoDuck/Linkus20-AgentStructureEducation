import type { DiagramBlock, ImageElement } from "../types";

/**
 * SmartGuide / AlignmentSnap / SnapLine
 * Figma/PowerPoint-style alignment: while moving or resizing a block/image, if
 * an edge / center / size nearly matches another object, nudge it into alignment
 * and surface a temporary sky-blue guide line. Guides are transient UI state
 * (not persisted). Arrows are excluded as alignment targets.
 */

// Project grid is 20px (index.css .canvas background-size). ~grid/4, rounded to
// a usable magnetic radius.
export const SMART_SNAP_THRESHOLD = 6;

export interface Bounds {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  centerX: number;
  right: number;
  top: number;
  centerY: number;
  bottom: number;
}

export type SmartGuideLine =
  | {
      id: string;
      orientation: "vertical";
      x: number;
      y1: number;
      y2: number;
      reason: "left" | "centerX" | "right";
    }
  | {
      id: string;
      orientation: "horizontal";
      y: number;
      x1: number;
      x2: number;
      reason: "top" | "centerY" | "bottom";
    };

type RectLike = { id: string; x: number; y: number; width: number; height: number };

export function getElementBounds(el: RectLike): Bounds {
  return {
    id: el.id,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    left: el.x,
    centerX: el.x + el.width / 2,
    right: el.x + el.width,
    top: el.y,
    centerY: el.y + el.height / 2,
    bottom: el.y + el.height,
  };
}

/** Alignment targets = all blocks + images except the active one (arrows excluded). */
export function collectBounds(
  blocks: DiagramBlock[],
  images: ImageElement[],
  excludeId: string
): Bounds[] {
  const out: Bounds[] = [];
  for (const b of blocks) if (b.id !== excludeId) out.push(getElementBounds(b));
  for (const im of images) if (im.id !== excludeId) out.push(getElementBounds(im));
  return out;
}

const X_KEYS = ["left", "centerX", "right"] as const;
const Y_KEYS = ["top", "centerY", "bottom"] as const;
type XKey = (typeof X_KEYS)[number];
type YKey = (typeof Y_KEYS)[number];

// Move priority: center first, then edges (one snap per axis).
const X_MOVE_PRIORITY: XKey[] = ["centerX", "left", "right"];
const Y_MOVE_PRIORITY: YKey[] = ["centerY", "top", "bottom"];

interface Cand<K extends string> {
  reason: K;
  delta: number; // value to add to the moving coordinate
  dist: number;
  o: Bounds;
}

function pick<K extends string>(cands: Cand<K>[], priority: K[]): Cand<K> | null {
  if (!cands.length) return null;
  return [...cands].sort((a, b) => {
    const pa = priority.indexOf(a.reason);
    const pb = priority.indexOf(b.reason);
    if (pa !== pb) return pa - pb;
    return a.dist - b.dist;
  })[0];
}

function shift(b: Bounds, dx: number, dy: number): Bounds {
  return getElementBounds({ id: b.id, x: b.x + dx, y: b.y + dy, width: b.width, height: b.height });
}

/**
 * Compute the position correction (dx, dy) + guide lines for a moving object.
 * One snap per axis (the highest-priority candidate within threshold).
 */
export function calculateSmartSnapOnMove(
  moving: Bounds,
  others: Bounds[],
  threshold: number
): { dx: number; dy: number; guides: SmartGuideLine[] } {
  const xCands: Cand<XKey>[] = [];
  const yCands: Cand<YKey>[] = [];

  for (const o of others) {
    for (const k of X_KEYS) {
      const delta = o[k] - moving[k];
      const dist = Math.abs(delta);
      if (dist <= threshold) xCands.push({ reason: k, delta, dist, o });
    }
    for (const k of Y_KEYS) {
      const delta = o[k] - moving[k];
      const dist = Math.abs(delta);
      if (dist <= threshold) yCands.push({ reason: k, delta, dist, o });
    }
  }

  const bx = pick(xCands, X_MOVE_PRIORITY);
  const by = pick(yCands, Y_MOVE_PRIORITY);
  const dx = bx ? bx.delta : 0;
  const dy = by ? by.delta : 0;

  const snapped = shift(moving, dx, dy);
  const guides: SmartGuideLine[] = [];
  if (bx) {
    guides.push({
      id: `v-${bx.reason}`,
      orientation: "vertical",
      x: snapped[bx.reason],
      y1: Math.min(snapped.top, bx.o.top),
      y2: Math.max(snapped.bottom, bx.o.bottom),
      reason: bx.reason,
    });
  }
  if (by) {
    guides.push({
      id: `h-${by.reason}`,
      orientation: "horizontal",
      y: snapped[by.reason],
      x1: Math.min(snapped.left, by.o.left),
      x2: Math.max(snapped.right, by.o.right),
      reason: by.reason,
    });
  }
  return { dx, dy, guides };
}

interface ResizeCand {
  weight: number; // 0 = edge align, 1 = equal size, 2 = center align
  pos: number; // new active-edge position
  dist: number;
  reason: XKey | YKey;
  o: Bounds;
}

function pickResize(cands: ResizeCand[]): ResizeCand | null {
  if (!cands.length) return null;
  return [...cands].sort((a, b) => (a.weight !== b.weight ? a.weight - b.weight : a.dist - b.dist))[0];
}

const MIN_SIZE = 20;

/**
 * Compute a corrected rect + guides while resizing. The moving edge(s) are
 * derived from `dir` (n/s/e/w/corners); each axis snaps to other objects' edges,
 * centers, or equal width/height (priority: edge > equal-size > center).
 */
export function calculateSmartSnapOnResize(
  proposed: RectLike,
  dir: string,
  others: Bounds[],
  threshold: number
): { x: number; y: number; width: number; height: number; guides: SmartGuideLine[] } {
  let { x, y, width, height } = proposed;
  const guides: SmartGuideLine[] = [];

  // ---- X axis (left/right handles) ----
  if (dir.includes("e") || dir.includes("w")) {
    const b = getElementBounds({ id: proposed.id, x, y, width, height });
    const isE = dir.includes("e");
    const activePos = isE ? b.right : b.left;
    const fixedLeft = b.left;
    const fixedRight = b.right;
    const edgeKey: XKey = isE ? "right" : "left";
    const cands: ResizeCand[] = [];
    for (const o of others) {
      for (const k of X_KEYS) {
        const dist = Math.abs(o[k] - activePos);
        if (dist <= threshold) {
          cands.push({ weight: k === "centerX" ? 2 : 0, pos: o[k], dist, reason: k, o });
        }
      }
      // equal width
      const pos = isE ? fixedLeft + o.width : fixedRight - o.width;
      const dist = Math.abs(o.width - width);
      if (dist <= threshold) cands.push({ weight: 1, pos, dist, reason: edgeKey, o });
    }
    const best = pickResize(cands);
    if (best) {
      if (isE) {
        width = Math.max(MIN_SIZE, best.pos - fixedLeft);
      } else {
        width = Math.max(MIN_SIZE, fixedRight - best.pos);
        x = fixedRight - width;
      }
      const nb = getElementBounds({ id: proposed.id, x, y, width, height });
      guides.push({
        id: `rv-${best.reason}`,
        orientation: "vertical",
        x: isE ? nb.right : nb.left,
        y1: Math.min(nb.top, best.o.top),
        y2: Math.max(nb.bottom, best.o.bottom),
        reason: best.reason as XKey,
      });
    }
  }

  // ---- Y axis (top/bottom handles) ----
  if (dir.includes("s") || dir.includes("n")) {
    const b = getElementBounds({ id: proposed.id, x, y, width, height });
    const isS = dir.includes("s");
    const activePos = isS ? b.bottom : b.top;
    const fixedTop = b.top;
    const fixedBottom = b.bottom;
    const edgeKey: YKey = isS ? "bottom" : "top";
    const cands: ResizeCand[] = [];
    for (const o of others) {
      for (const k of Y_KEYS) {
        const dist = Math.abs(o[k] - activePos);
        if (dist <= threshold) {
          cands.push({ weight: k === "centerY" ? 2 : 0, pos: o[k], dist, reason: k, o });
        }
      }
      const pos = isS ? fixedTop + o.height : fixedBottom - o.height;
      const dist = Math.abs(o.height - height);
      if (dist <= threshold) cands.push({ weight: 1, pos, dist, reason: edgeKey, o });
    }
    const best = pickResize(cands);
    if (best) {
      if (isS) {
        height = Math.max(MIN_SIZE, best.pos - fixedTop);
      } else {
        height = Math.max(MIN_SIZE, fixedBottom - best.pos);
        y = fixedBottom - height;
      }
      const nb = getElementBounds({ id: proposed.id, x, y, width, height });
      guides.push({
        id: `rh-${best.reason}`,
        orientation: "horizontal",
        y: isS ? nb.bottom : nb.top,
        x1: Math.min(nb.left, best.o.left),
        x2: Math.max(nb.right, best.o.right),
        reason: best.reason as YKey,
      });
    }
  }

  return { x, y, width, height, guides };
}

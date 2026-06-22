import type { ArrowElement, DiagramBlock, ElementRef, ImageElement } from "../types";
import { arrowEndPoint, arrowStartPoint } from "./anchors";

/**
 * MarqueeSelection / MultiSelection / GroupSelection helpers.
 * Unified geometry + hit-testing across blocks, images and arrows.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const MIN_ELEMENT_WIDTH = 24;
export const MIN_ELEMENT_HEIGHT = 24;
export const MIN_GROUP_WIDTH = 40;
export const MIN_GROUP_HEIGHT = 40;

interface DiagramData {
  blocks: DiagramBlock[];
  arrows: ArrowElement[];
  images: ImageElement[];
}

/** Axis-aligned bounding box of an arrow (from its two endpoints). */
export function arrowRect(a: ArrowElement): Rect {
  const s = arrowStartPoint(a);
  const e = arrowEndPoint(a);
  const x = Math.min(s.x, e.x);
  const y = Math.min(s.y, e.y);
  return { x, y, width: Math.max(1, Math.abs(e.x - s.x)), height: Math.max(1, Math.abs(e.y - s.y)) };
}

export function getRefRect(ref: ElementRef, data: DiagramData): Rect | null {
  if (ref.type === "block") {
    const b = data.blocks.find((x) => x.id === ref.id);
    return b ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
  }
  if (ref.type === "image") {
    const im = data.images.find((x) => x.id === ref.id);
    return im ? { x: im.x, y: im.y, width: im.width, height: im.height } : null;
  }
  const a = data.arrows.find((x) => x.id === ref.id);
  return a ? arrowRect(a) : null;
}

/** Bounding box that contains all referenced elements (null if empty). */
export function getSelectionRect(refs: ElementRef[], data: DiagramData): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ref of refs) {
    const r = getRefRect(ref, data);
    if (!r) continue;
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** All selectable refs on the canvas. */
export function allRefs(data: DiagramData): ElementRef[] {
  return [
    ...data.blocks.map((b): ElementRef => ({ type: "block", id: b.id })),
    ...data.images.map((im): ElementRef => ({ type: "image", id: im.id })),
    ...data.arrows.map((a): ElementRef => ({ type: "arrow", id: a.id })),
  ];
}

export type MarqueeMode = "intersects" | "contains" | "majority";

export function isElementInMarquee(
  el: Rect,
  marquee: Rect,
  mode: MarqueeMode = "intersects"
): boolean {
  const ex2 = el.x + el.width;
  const ey2 = el.y + el.height;
  const mx2 = marquee.x + marquee.width;
  const my2 = marquee.y + marquee.height;

  const ix = Math.max(0, Math.min(ex2, mx2) - Math.max(el.x, marquee.x));
  const iy = Math.max(0, Math.min(ey2, my2) - Math.max(el.y, marquee.y));
  const interArea = ix * iy;

  if (mode === "intersects") return interArea > 0;
  if (mode === "contains") {
    return el.x >= marquee.x && el.y >= marquee.y && ex2 <= mx2 && ey2 <= my2;
  }
  // majority: ≥50% of the element overlaps the marquee
  const elArea = el.width * el.height;
  return elArea > 0 && interArea / elArea >= 0.5;
}

/** Refs whose elements fall inside the marquee rect. */
export function refsInMarquee(marquee: Rect, data: DiagramData, mode: MarqueeMode): ElementRef[] {
  return allRefs(data).filter((ref) => {
    const r = getRefRect(ref, data);
    return r ? isElementInMarquee(r, marquee, mode) : false;
  });
}

export function refEquals(a: ElementRef, b: ElementRef): boolean {
  return a.type === b.type && a.id === b.id;
}

export function isRefSelected(ref: ElementRef, selection: ElementRef[]): boolean {
  return selection.some((s) => refEquals(s, ref));
}

function groupIdOf(ref: ElementRef, data: DiagramData): string | undefined {
  if (ref.type === "block") return data.blocks.find((b) => b.id === ref.id)?.groupId;
  if (ref.type === "image") return data.images.find((im) => im.id === ref.id)?.groupId;
  return data.arrows.find((a) => a.id === ref.id)?.groupId;
}

/** Expand refs to include every element sharing a groupId with any of them. */
export function expandGroups(refs: ElementRef[], data: DiagramData): ElementRef[] {
  const groupIds = new Set<string>();
  for (const ref of refs) {
    const gid = groupIdOf(ref, data);
    if (gid) groupIds.add(gid);
  }
  if (!groupIds.size) return refs;
  const out = [...refs];
  const seen = new Set(refs.map((r) => `${r.type}:${r.id}`));
  const add = (ref: ElementRef) => {
    const k = `${ref.type}:${ref.id}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(ref);
    }
  };
  for (const b of data.blocks) if (b.groupId && groupIds.has(b.groupId)) add({ type: "block", id: b.id });
  for (const im of data.images) if (im.groupId && groupIds.has(im.groupId)) add({ type: "image", id: im.id });
  for (const a of data.arrows) if (a.groupId && groupIds.has(a.groupId)) add({ type: "arrow", id: a.id });
  return out;
}

/** Proportionally map a rect from one group bbox to another (group resize). */
export function transformRectByGroupResize(rect: Rect, before: Rect, after: Rect): Rect {
  const sx = before.width ? after.width / before.width : 1;
  const sy = before.height ? after.height / before.height : 1;
  return {
    x: after.x + (rect.x - before.x) * sx,
    y: after.y + (rect.y - before.y) * sy,
    width: rect.width * sx,
    height: rect.height * sy,
  };
}

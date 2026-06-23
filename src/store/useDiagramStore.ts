import { create } from "zustand";
import type {
  AIType,
  ArrowConnection,
  ArrowElement,
  BlockType,
  DiagramBlock,
  ElementRef,
  ImageElement,
  LogoItem,
  SelectedKind,
} from "../types";
import { arrowEndPoint, arrowStartPoint, endpointsToArrow, reconcileArrow } from "../utils/anchors";
import { applyOperations, toGraph, validateOperations } from "../ai/diagramBridge";
import type { Operation } from "../ai/types";
import type { SmartGuideLine } from "../utils/smartGuides";
import {
  allRefs,
  expandGroups,
  getRefRect,
  getSelectionRect,
  isRefSelected,
  MIN_ELEMENT_HEIGHT,
  MIN_ELEMENT_WIDTH,
  refEquals,
  transformRectByGroupResize,
  type Rect,
} from "../utils/selection";

type AlignKind = "left" | "centerX" | "right" | "top" | "centerY" | "bottom";

interface Snapshot {
  blocks: DiagramBlock[];
  arrows: ArrowElement[];
  images: ImageElement[];
}

interface DiagramData {
  blocks: DiagramBlock[];
  arrows: ArrowElement[];
  images: ImageElement[];
}

interface DiagramState extends DiagramData {
  title: string;
  /** Multi-selection source of truth (length 1 = single selection). */
  selection: ElementRef[];

  // Undo/redo stacks (snapshots of blocks/arrows/images).
  past: Snapshot[];
  future: Snapshot[];

  // Bottom-sheet logo picker target.
  activeLogoPickerBlockId?: string;
  activeLogoPickerAIType?: AIType;

  // Transient smart-alignment guide lines.
  smartGuides: SmartGuideLine[];

  setTitle: (title: string) => void;
  addBlock: (type: BlockType) => void;
  addArrow: () => void;

  // Selection.
  select: (id: string, kind: SelectedKind) => void;
  toggleSelection: (ref: ElementRef) => void;
  setSelection: (refs: ElementRef[]) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Single-element live edits (existing behaviour, no history; gesture calls beginHistory).
  moveBlock: (id: string, x: number, y: number) => void;
  resizeBlock: (id: string, patch: Partial<Pick<DiagramBlock, "x" | "y" | "width" | "height">>) => void;
  updateBlock: (id: string, patch: Partial<DiagramBlock>) => void;
  moveArrow: (id: string, x: number, y: number) => void;
  updateArrow: (id: string, patch: Partial<ArrowElement>) => void;
  updateArrowConnection: (arrowId: string, endpoint: "start" | "end", connection?: ArrowConnection) => void;
  addImageElement: (image: ImageElement) => void;
  updateImageElement: (id: string, patch: Partial<ImageElement>) => void;

  // Multi-selection transforms.
  deleteSelection: () => void;
  moveSelection: (dx: number, dy: number) => void;
  applyGroupResize: (origin: Snapshot, before: Rect, after: Rect) => void;
  duplicateSelection: () => void;
  group: () => void;
  ungroup: () => void;
  alignSelection: (kind: AlignKind) => void;
  distributeSelection: (axis: "x" | "y") => void;

  // Logo.
  openLogoPicker: (blockId: string, aiType: AIType) => void;
  closeLogoPicker: () => void;
  setSelectedLogo: (blockId: string, logo: LogoItem) => void;
  clearSelectedLogo: (blockId: string) => void;

  // Smart guides.
  setSmartGuides: (guides: SmartGuideLine[]) => void;
  clearSmartGuides: () => void;

  // AI Assistant — 검증된 operations 를 일괄 적용(단일 history 스냅샷).
  applyAIOperations: (ops: Operation[]) => void;

  // 레이어 순서(zIndex).
  bringToFront: (ref: ElementRef) => void;
  bringForward: (ref: ElementRef) => void;
  sendBackward: (ref: ElementRef) => void;
  sendToBack: (ref: ElementRef) => void;
  normalizeZIndex: () => void;

  // JSON 불러오기 — 그래프에서 복원한 blocks/arrows 로 캔버스 교체.
  loadDiagram: (blocks: DiagramBlock[], arrows: ArrowElement[]) => void;

  // History.
  beginHistory: () => void;
  undo: () => void;
  redo: () => void;
}

const DEFAULT_TEXT: Record<BlockType, string> = {
  user: "사용자",
  rectangle: "사각형",
  diamond: "조건",
  rounded: "프로세스",
};

const DEFAULT_SIZE: Record<BlockType, { width: number; height: number }> = {
  user: { width: 110, height: 110 },
  rectangle: { width: 160, height: 90 },
  diamond: { width: 140, height: 100 },
  rounded: { width: 160, height: 90 },
};

const HISTORY_LIMIT = 50;
let spawnCounter = 0;

const snap = (s: DiagramData): Snapshot => ({ blocks: s.blocks, arrows: s.arrows, images: s.images });
const pushPast = (s: DiagramState): Snapshot[] => [...s.past, snap(s)].slice(-HISTORY_LIMIT);

// ---- 레이어(zIndex) 헬퍼 ----
const allZ = (s: DiagramData): number[] => [
  ...s.blocks.map((b) => b.zIndex ?? 0),
  ...s.arrows.map((a) => a.zIndex ?? 0),
  ...s.images.map((im) => im.zIndex ?? 0),
];
const maxZ = (s: DiagramData): number => Math.max(0, ...allZ(s));
const nextZ = (s: DiagramData): number => maxZ(s) + 1;

type ZLayers = Pick<DiagramData, "blocks" | "arrows" | "images">;

/** 모든 요소를 zIndex 오름차순으로(아래→위). 동률은 block→arrow→image 순(렌더 순서와 일치). */
function allSortedByZ(s: DiagramData): { type: SelectedKind; id: string; z: number }[] {
  const list = [
    ...s.blocks.map((b) => ({ type: "block" as SelectedKind, id: b.id, z: b.zIndex ?? 0 })),
    ...s.arrows.map((a) => ({ type: "arrow" as SelectedKind, id: a.id, z: a.zIndex ?? 0 })),
    ...s.images.map((im) => ({ type: "image" as SelectedKind, id: im.id, z: im.zIndex ?? 0 })),
  ];
  return list.sort((p, q) => p.z - q.z); // Array.sort 는 안정 정렬 → 동률은 입력(block→arrow→image) 순 유지
}

/** order 배열(아래→위)대로 zIndex 를 1..N 으로 재부여 → 항상 작고 유니크(무한증가·동률 문제 차단). */
function applyOrder(s: DiagramData, order: { type: SelectedKind; id: string }[]): ZLayers {
  const zmap = new Map(order.map((e, idx) => [`${e.type}:${e.id}`, idx + 1]));
  return {
    blocks: s.blocks.map((b) => ({ ...b, zIndex: zmap.get(`block:${b.id}`) ?? b.zIndex })),
    arrows: s.arrows.map((a) => ({ ...a, zIndex: zmap.get(`arrow:${a.id}`) ?? a.zIndex })),
    images: s.images.map((im) => ({ ...im, zIndex: zmap.get(`image:${im.id}`) ?? im.zIndex })),
  };
}

/** ref 를 정렬 순서에서 한 단계/맨끝으로 이동한 뒤 1..N 재부여. */
function reorderZ(s: DiagramData, ref: ElementRef, move: "front" | "back" | "forward" | "backward"): ZLayers {
  const sorted = allSortedByZ(s);
  const i = sorted.findIndex((e) => e.type === ref.type && e.id === ref.id);
  if (i < 0) return { blocks: s.blocks, arrows: s.arrows, images: s.images };
  const order = sorted.map((e) => ({ type: e.type, id: e.id }));
  const [item] = order.splice(i, 1);
  if (move === "front") order.push(item);
  else if (move === "back") order.unshift(item);
  else if (move === "forward") order.splice(Math.min(i + 1, order.length), 0, item);
  else order.splice(Math.max(i - 1, 0), 0, item);
  return applyOrder(s, order);
}

function reconcileArrowsFor(blockId: string, blocks: DiagramBlock[], arrows: ArrowElement[]): ArrowElement[] {
  return arrows.map((a) =>
    a.startConnection?.blockId === blockId || a.endConnection?.blockId === blockId
      ? reconcileArrow(a, blocks)
      : a
  );
}

function selSets(selection: ElementRef[]) {
  return {
    b: new Set(selection.filter((r) => r.type === "block").map((r) => r.id)),
    i: new Set(selection.filter((r) => r.type === "image").map((r) => r.id)),
    a: new Set(selection.filter((r) => r.type === "arrow").map((r) => r.id)),
  };
}

export const useDiagramStore = create<DiagramState>((set) => ({
  title: "디폴트 구조도",
  blocks: [],
  arrows: [],
  images: [],
  selection: [],
  past: [],
  future: [],
  activeLogoPickerBlockId: undefined,
  activeLogoPickerAIType: undefined,
  smartGuides: [],

  setTitle: (title) => set({ title }),

  addBlock: (type) =>
    set((state) => {
      const size = DEFAULT_SIZE[type];
      const offset = (spawnCounter % 6) * 24;
      spawnCounter += 1;
      const block: DiagramBlock = {
        id: crypto.randomUUID(),
        type,
        x: 360 + offset,
        y: 240 + offset,
        width: size.width,
        height: size.height,
        text: DEFAULT_TEXT[type],
        zIndex: nextZ(state),
      };
      return {
        blocks: [...state.blocks, block],
        selection: [{ type: "block", id: block.id }],
        past: pushPast(state),
        future: [],
      };
    }),

  addArrow: () =>
    set((state) => {
      const offset = (spawnCounter % 6) * 24;
      spawnCounter += 1;
      const arrow: ArrowElement = {
        id: crypto.randomUUID(),
        x: 360 + offset,
        y: 320 + offset,
        width: 160,
        rotation: 0,
        curve: 0,
        zIndex: nextZ(state),
      };
      return {
        arrows: [...state.arrows, arrow],
        selection: [{ type: "arrow", id: arrow.id }],
        past: pushPast(state),
        future: [],
      };
    }),

  select: (id, kind) => set((state) => ({ selection: expandGroups([{ type: kind, id }], state) })),

  toggleSelection: (ref) =>
    set((state) => {
      if (isRefSelected(ref, state.selection)) {
        return { selection: state.selection.filter((s) => !refEquals(s, ref)) };
      }
      const merged = [...state.selection];
      for (const r of expandGroups([ref], state)) {
        if (!isRefSelected(r, merged)) merged.push(r);
      }
      return { selection: merged };
    }),

  setSelection: (refs) => set((state) => ({ selection: expandGroups(refs, state) })),

  selectAll: () => set((state) => ({ selection: allRefs(state) })),

  clearSelection: () => set({ selection: [] }),

  moveBlock: (id, x, y) =>
    set((state) => {
      const blocks = state.blocks.map((b) => (b.id === id ? { ...b, x, y } : b));
      return { blocks, arrows: reconcileArrowsFor(id, blocks, state.arrows) };
    }),

  resizeBlock: (id, patch) =>
    set((state) => {
      const blocks = state.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b));
      return { blocks, arrows: reconcileArrowsFor(id, blocks, state.arrows) };
    }),

  updateBlock: (id, patch) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      past: pushPast(state),
      future: [],
    })),

  moveArrow: (id, x, y) =>
    set((state) => ({
      arrows: state.arrows.map((a) => (a.id === id ? { ...a, x, y } : a)),
    })),

  updateArrow: (id, patch) =>
    set((state) => ({
      arrows: state.arrows.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),

  updateArrowConnection: (arrowId, endpoint, connection) =>
    set((state) => ({
      arrows: state.arrows.map((a) =>
        a.id === arrowId
          ? { ...a, [endpoint === "start" ? "startConnection" : "endConnection"]: connection }
          : a
      ),
    })),

  addImageElement: (image) =>
    set((state) => ({
      images: [...state.images, { ...image, zIndex: nextZ(state) }],
      selection: [{ type: "image", id: image.id }],
      past: pushPast(state),
      future: [],
    })),

  updateImageElement: (id, patch) =>
    set((state) => ({
      images: state.images.map((im) => (im.id === id ? { ...im, ...patch } : im)),
    })),

  deleteSelection: () =>
    set((state) => {
      if (!state.selection.length) return state;
      const { b: bSel, i: iSel, a: aSel } = selSets(state.selection);
      const blocks = state.blocks.filter((bl) => !bSel.has(bl.id));
      const images = state.images.filter((im) => !iSel.has(im.id));
      // Remove selected arrows + arrows connected to any deleted block.
      const arrows = state.arrows.filter((ar) => {
        if (aSel.has(ar.id)) return false;
        if (ar.startConnection && bSel.has(ar.startConnection.blockId)) return false;
        if (ar.endConnection && bSel.has(ar.endConnection.blockId)) return false;
        return true;
      });
      const closingPicker =
        state.activeLogoPickerBlockId !== undefined && bSel.has(state.activeLogoPickerBlockId);
      return {
        blocks,
        images,
        arrows,
        selection: [],
        past: pushPast(state),
        future: [],
        activeLogoPickerBlockId: closingPicker ? undefined : state.activeLogoPickerBlockId,
        activeLogoPickerAIType: closingPicker ? undefined : state.activeLogoPickerAIType,
      };
    }),

  moveSelection: (dx, dy) =>
    set((state) => {
      const { b: bSel, i: iSel, a: aSel } = selSets(state.selection);
      const blocks = state.blocks.map((b) => (bSel.has(b.id) ? { ...b, x: b.x + dx, y: b.y + dy } : b));
      const images = state.images.map((im) => (iSel.has(im.id) ? { ...im, x: im.x + dx, y: im.y + dy } : im));
      const arrows = state.arrows.map((a) => {
        if (aSel.has(a.id)) return { ...a, x: a.x + dx, y: a.y + dy };
        if (
          (a.startConnection && bSel.has(a.startConnection.blockId)) ||
          (a.endConnection && bSel.has(a.endConnection.blockId))
        ) {
          return reconcileArrow(a, blocks);
        }
        return a;
      });
      return { blocks, images, arrows };
    }),

  applyGroupResize: (origin, before, after) =>
    set((state) => {
      const { b: bSel, i: iSel, a: aSel } = selSets(state.selection);
      const tf = (r: Rect): Rect => transformRectByGroupResize(r, before, after);
      const sx = before.width ? after.width / before.width : 1;
      const sy = before.height ? after.height / before.height : 1;

      const blocks = state.blocks.map((b) => {
        if (!bSel.has(b.id)) return b;
        const o = origin.blocks.find((x) => x.id === b.id);
        if (!o) return b;
        const nr = tf({ x: o.x, y: o.y, width: o.width, height: o.height });
        return {
          ...b,
          x: nr.x,
          y: nr.y,
          width: Math.max(MIN_ELEMENT_WIDTH, nr.width),
          height: Math.max(MIN_ELEMENT_HEIGHT, nr.height),
        };
      });
      const images = state.images.map((im) => {
        if (!iSel.has(im.id)) return im;
        const o = origin.images.find((x) => x.id === im.id);
        if (!o) return im;
        const nr = tf({ x: o.x, y: o.y, width: o.width, height: o.height });
        return {
          ...im,
          x: nr.x,
          y: nr.y,
          width: Math.max(MIN_ELEMENT_WIDTH, nr.width),
          height: Math.max(MIN_ELEMENT_HEIGHT, nr.height),
        };
      });
      const arrows = state.arrows.map((a) => {
        if (aSel.has(a.id)) {
          const o = origin.arrows.find((x) => x.id === a.id);
          if (!o) return a;
          const s = arrowStartPoint(o);
          const e = arrowEndPoint(o);
          const ns = { x: after.x + (s.x - before.x) * sx, y: after.y + (s.y - before.y) * sy };
          const ne = { x: after.x + (e.x - before.x) * sx, y: after.y + (e.y - before.y) * sy };
          return { ...a, ...endpointsToArrow(ns, ne), curve: o.curve * ((sx + sy) / 2) };
        }
        if (
          (a.startConnection && bSel.has(a.startConnection.blockId)) ||
          (a.endConnection && bSel.has(a.endConnection.blockId))
        ) {
          return reconcileArrow(a, blocks);
        }
        return a;
      });
      return { blocks, images, arrows };
    }),

  duplicateSelection: () =>
    set((state) => {
      if (!state.selection.length) return state;
      const { b: bSel, i: iSel, a: aSel } = selSets(state.selection);
      const OFFSET = 20;
      const blockIdMap = new Map<string, string>();
      const groupIdMap = new Map<string, string>();
      const remapGroup = (gid?: string) => {
        if (!gid) return undefined;
        if (!groupIdMap.has(gid)) groupIdMap.set(gid, crypto.randomUUID());
        return groupIdMap.get(gid);
      };

      let zc = nextZ(state); // 복제본은 원본보다 위로(연속 부여)
      const newBlocks: DiagramBlock[] = [];
      for (const b of state.blocks) {
        if (!bSel.has(b.id)) continue;
        const id = crypto.randomUUID();
        blockIdMap.set(b.id, id);
        newBlocks.push({ ...b, id, x: b.x + OFFSET, y: b.y + OFFSET, groupId: remapGroup(b.groupId), zIndex: zc++ });
      }
      const newImages: ImageElement[] = [];
      for (const im of state.images) {
        if (!iSel.has(im.id)) continue;
        newImages.push({ ...im, id: crypto.randomUUID(), x: im.x + OFFSET, y: im.y + OFFSET, groupId: remapGroup(im.groupId), zIndex: zc++ });
      }
      const newArrows: ArrowElement[] = [];
      for (const a of state.arrows) {
        if (!aSel.has(a.id)) continue;
        const remapConn = (c?: ArrowConnection): ArrowConnection | undefined => {
          if (!c) return undefined;
          const nb = blockIdMap.get(c.blockId);
          return nb ? { ...c, blockId: nb } : undefined;
        };
        newArrows.push({
          ...a,
          id: crypto.randomUUID(),
          x: a.x + OFFSET,
          y: a.y + OFFSET,
          groupId: remapGroup(a.groupId),
          startConnection: remapConn(a.startConnection),
          endConnection: remapConn(a.endConnection),
          zIndex: zc++,
        });
      }
      const selection: ElementRef[] = [
        ...newBlocks.map((b): ElementRef => ({ type: "block", id: b.id })),
        ...newImages.map((im): ElementRef => ({ type: "image", id: im.id })),
        ...newArrows.map((a): ElementRef => ({ type: "arrow", id: a.id })),
      ];
      return {
        blocks: [...state.blocks, ...newBlocks],
        images: [...state.images, ...newImages],
        arrows: [...state.arrows, ...newArrows],
        selection,
        past: pushPast(state),
        future: [],
      };
    }),

  group: () =>
    set((state) => {
      if (state.selection.length < 2) return state;
      const gid = crypto.randomUUID();
      const { b: bSel, i: iSel, a: aSel } = selSets(state.selection);
      return {
        blocks: state.blocks.map((b) => (bSel.has(b.id) ? { ...b, groupId: gid } : b)),
        images: state.images.map((im) => (iSel.has(im.id) ? { ...im, groupId: gid } : im)),
        arrows: state.arrows.map((a) => (aSel.has(a.id) ? { ...a, groupId: gid } : a)),
        past: pushPast(state),
        future: [],
      };
    }),

  ungroup: () =>
    set((state) => {
      if (!state.selection.length) return state;
      const { b: bSel, i: iSel, a: aSel } = selSets(state.selection);
      return {
        blocks: state.blocks.map((b) => (bSel.has(b.id) && b.groupId ? { ...b, groupId: undefined } : b)),
        images: state.images.map((im) => (iSel.has(im.id) && im.groupId ? { ...im, groupId: undefined } : im)),
        arrows: state.arrows.map((a) => (aSel.has(a.id) && a.groupId ? { ...a, groupId: undefined } : a)),
        past: pushPast(state),
        future: [],
      };
    }),

  alignSelection: (kind) =>
    set((state) => {
      if (state.selection.length < 2) return state;
      const rect = getSelectionRect(state.selection, state);
      if (!rect) return state;
      const { b: bSel, i: iSel, a: aSel } = selSets(state.selection);

      const dxFor = (r: Rect): number => {
        if (kind === "left") return rect.x - r.x;
        if (kind === "centerX") return rect.x + rect.width / 2 - (r.x + r.width / 2);
        if (kind === "right") return rect.x + rect.width - (r.x + r.width);
        return 0;
      };
      const dyFor = (r: Rect): number => {
        if (kind === "top") return rect.y - r.y;
        if (kind === "centerY") return rect.y + rect.height / 2 - (r.y + r.height / 2);
        if (kind === "bottom") return rect.y + rect.height - (r.y + r.height);
        return 0;
      };

      const moveRect = (id: string, type: SelectedKind) => {
        const r = getRefRect({ type, id }, state);
        if (!r) return { dx: 0, dy: 0 };
        return { dx: dxFor(r), dy: dyFor(r) };
      };

      const blocks = state.blocks.map((b) => {
        if (!bSel.has(b.id)) return b;
        const { dx, dy } = moveRect(b.id, "block");
        return { ...b, x: b.x + dx, y: b.y + dy };
      });
      const images = state.images.map((im) => {
        if (!iSel.has(im.id)) return im;
        const { dx, dy } = moveRect(im.id, "image");
        return { ...im, x: im.x + dx, y: im.y + dy };
      });
      let arrows = state.arrows.map((a) => {
        if (!aSel.has(a.id)) return a;
        const { dx, dy } = moveRect(a.id, "arrow");
        return { ...a, x: a.x + dx, y: a.y + dy };
      });
      // Reconcile non-selected arrows connected to moved blocks.
      arrows = arrows.map((a) =>
        !aSel.has(a.id) &&
        ((a.startConnection && bSel.has(a.startConnection.blockId)) ||
          (a.endConnection && bSel.has(a.endConnection.blockId)))
          ? reconcileArrow(a, blocks)
          : a
      );
      return { blocks, images, arrows, past: pushPast(state), future: [] };
    }),

  distributeSelection: (axis) =>
    set((state) => {
      if (state.selection.length < 3) return state;
      const items = state.selection
        .map((ref) => ({ ref, rect: getRefRect(ref, state) }))
        .filter((it): it is { ref: ElementRef; rect: Rect } => it.rect !== null);
      if (items.length < 3) return state;

      const center = (r: Rect) => (axis === "x" ? r.x + r.width / 2 : r.y + r.height / 2);
      items.sort((p, q) => center(p.rect) - center(q.rect));
      const first = center(items[0].rect);
      const last = center(items[items.length - 1].rect);
      const step = (last - first) / (items.length - 1);

      const delta = new Map<string, { dx: number; dy: number }>();
      items.forEach((it, idx) => {
        if (idx === 0 || idx === items.length - 1) return;
        const targetCenter = first + step * idx;
        const cur = center(it.rect);
        const d = targetCenter - cur;
        delta.set(`${it.ref.type}:${it.ref.id}`, axis === "x" ? { dx: d, dy: 0 } : { dx: 0, dy: d });
      });
      const get = (type: SelectedKind, id: string) => delta.get(`${type}:${id}`) ?? { dx: 0, dy: 0 };

      const blocks = state.blocks.map((b) => {
        const { dx, dy } = get("block", b.id);
        return dx || dy ? { ...b, x: b.x + dx, y: b.y + dy } : b;
      });
      const images = state.images.map((im) => {
        const { dx, dy } = get("image", im.id);
        return dx || dy ? { ...im, x: im.x + dx, y: im.y + dy } : im;
      });
      const { b: bSel } = selSets(state.selection);
      let arrows = state.arrows.map((a) => {
        const { dx, dy } = get("arrow", a.id);
        return dx || dy ? { ...a, x: a.x + dx, y: a.y + dy } : a;
      });
      arrows = arrows.map((a) =>
        (a.startConnection && bSel.has(a.startConnection.blockId)) ||
        (a.endConnection && bSel.has(a.endConnection.blockId))
          ? reconcileArrow(a, blocks)
          : a
      );
      return { blocks, images, arrows, past: pushPast(state), future: [] };
    }),

  openLogoPicker: (blockId, aiType) =>
    set({ activeLogoPickerBlockId: blockId, activeLogoPickerAIType: aiType }),

  closeLogoPicker: () => set({ activeLogoPickerBlockId: undefined, activeLogoPickerAIType: undefined }),

  setSelectedLogo: (blockId, logo) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === blockId ? { ...b, selectedLogo: logo } : b)),
      past: pushPast(state),
      future: [],
    })),

  clearSelectedLogo: (blockId) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === blockId ? { ...b, selectedLogo: undefined } : b)),
    })),

  setSmartGuides: (guides) => set({ smartGuides: guides }),

  clearSmartGuides: () => set((state) => (state.smartGuides.length ? { smartGuides: [] } : state)),

  applyAIOperations: (ops) =>
    set((state) => {
      if (!ops.length) return state;
      // 공개 API 방어: 검증 없이 들어온 호출도 막는다(검증은 적용의 단일 관문).
      const { errors } = validateOperations(ops, toGraph(state.blocks, state.arrows));
      if (errors.length) {
        console.warn("[applyAIOperations] 검증 실패 → 적용 중단:", errors);
        return state;
      }
      const { blocks, arrows } = applyOperations({ blocks: state.blocks, arrows: state.arrows }, ops);
      return { blocks, arrows, selection: [], past: pushPast(state), future: [] };
    }),

  bringToFront: (ref) =>
    set((state) => ({ ...reorderZ(state, ref, "front"), past: pushPast(state), future: [] })),

  sendToBack: (ref) =>
    set((state) => ({ ...reorderZ(state, ref, "back"), past: pushPast(state), future: [] })),

  bringForward: (ref) =>
    set((state) => ({ ...reorderZ(state, ref, "forward"), past: pushPast(state), future: [] })),

  sendBackward: (ref) =>
    set((state) => ({ ...reorderZ(state, ref, "backward"), past: pushPast(state), future: [] })),

  normalizeZIndex: () =>
    set((state) => applyOrder(state, allSortedByZ(state).map((e) => ({ type: e.type, id: e.id })))),

  loadDiagram: (blocks, arrows) =>
    set((state) => ({
      blocks,
      arrows,
      images: state.images,
      selection: [],
      past: pushPast(state),
      future: [],
    })),

  beginHistory: () => set((state) => ({ past: pushPast(state), future: [] })),

  undo: () =>
    set((state) => {
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      return {
        blocks: prev.blocks,
        arrows: prev.arrows,
        images: prev.images,
        past: state.past.slice(0, -1),
        future: [snap(state), ...state.future].slice(0, HISTORY_LIMIT),
        selection: [],
      };
    }),

  redo: () =>
    set((state) => {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        blocks: next.blocks,
        arrows: next.arrows,
        images: next.images,
        past: [...state.past, snap(state)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        selection: [],
      };
    }),
}));

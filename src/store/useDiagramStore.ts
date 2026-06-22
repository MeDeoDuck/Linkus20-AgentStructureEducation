import { create } from "zustand";
import type { ArrowElement, BlockType, DiagramBlock } from "../types";

type SelectedKind = "block" | "arrow" | null;

interface DiagramState {
  title: string;
  blocks: DiagramBlock[];
  arrows: ArrowElement[];
  selectedId: string | null;
  selectedKind: SelectedKind;

  setTitle: (title: string) => void;
  addBlock: (type: BlockType) => void;
  addArrow: () => void;
  select: (id: string, kind: Exclude<SelectedKind, null>) => void;
  clearSelection: () => void;
  moveBlock: (id: string, x: number, y: number) => void;
  resizeBlock: (id: string, patch: Partial<Pick<DiagramBlock, "x" | "y" | "width" | "height">>) => void;
  updateBlock: (id: string, patch: Partial<DiagramBlock>) => void;
  deleteSelected: () => void;
  moveArrow: (id: string, x: number, y: number) => void;
  updateArrow: (id: string, patch: Partial<ArrowElement>) => void;
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
  diamond: { width: 140, height: 120 },
  rounded: { width: 160, height: 90 },
};

// Spawn blocks near the center of the working area with a small cascade offset.
let spawnCounter = 0;

export const useDiagramStore = create<DiagramState>((set) => ({
  title: "디폴트 구조도",
  blocks: [],
  arrows: [],
  selectedId: null,
  selectedKind: null,

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
        logos: [],
      };
      return {
        blocks: [...state.blocks, block],
        selectedId: block.id,
        selectedKind: "block",
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
      };
      return {
        arrows: [...state.arrows, arrow],
        selectedId: arrow.id,
        selectedKind: "arrow",
      };
    }),

  select: (id, kind) => set({ selectedId: id, selectedKind: kind }),

  clearSelection: () => set({ selectedId: null, selectedKind: null }),

  moveBlock: (id, x, y) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === id ? { ...b, x, y } : b)),
    })),

  resizeBlock: (id, patch) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    })),

  updateBlock: (id, patch) =>
    set((state) => ({
      blocks: state.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    })),

  deleteSelected: () =>
    set((state) => {
      if (!state.selectedId) return state;
      return {
        blocks: state.blocks.filter((b) => b.id !== state.selectedId),
        arrows: state.arrows.filter((a) => a.id !== state.selectedId),
        selectedId: null,
        selectedKind: null,
      };
    }),

  moveArrow: (id, x, y) =>
    set((state) => ({
      arrows: state.arrows.map((a) => (a.id === id ? { ...a, x, y } : a)),
    })),

  updateArrow: (id, patch) =>
    set((state) => ({
      arrows: state.arrows.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),
}));

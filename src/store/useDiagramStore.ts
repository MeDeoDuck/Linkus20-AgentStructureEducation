import { create } from "zustand";
import type {
  AIType,
  ArrowConnection,
  ArrowElement,
  BlockType,
  DiagramBlock,
  ImageElement,
  LogoItem,
  SelectedKind,
} from "../types";
import { reconcileArrow } from "../utils/anchors";

interface DiagramState {
  title: string;
  blocks: DiagramBlock[];
  arrows: ArrowElement[];
  images: ImageElement[];
  selectedId: string | null;
  selectedKind: SelectedKind;

  // Bottom-sheet logo picker target.
  activeLogoPickerBlockId?: string;
  activeLogoPickerAIType?: AIType;

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
  updateArrowConnection: (
    arrowId: string,
    endpoint: "start" | "end",
    connection?: ArrowConnection
  ) => void;

  // Images.
  addImageElement: (image: ImageElement) => void;
  updateImageElement: (id: string, patch: Partial<ImageElement>) => void;

  // Logo selection.
  openLogoPicker: (blockId: string, aiType: AIType) => void;
  closeLogoPicker: () => void;
  setSelectedLogo: (blockId: string, logo: LogoItem) => void;
  clearSelectedLogo: (blockId: string) => void;
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

/** Re-derive geometry of every arrow attached to `blockId` (single pass). */
function reconcileArrowsFor(
  blockId: string,
  blocks: DiagramBlock[],
  arrows: ArrowElement[]
): ArrowElement[] {
  return arrows.map((a) =>
    a.startConnection?.blockId === blockId || a.endConnection?.blockId === blockId
      ? reconcileArrow(a, blocks)
      : a
  );
}

export const useDiagramStore = create<DiagramState>((set) => ({
  title: "디폴트 구조도",
  blocks: [],
  arrows: [],
  images: [],
  selectedId: null,
  selectedKind: null,
  activeLogoPickerBlockId: undefined,
  activeLogoPickerAIType: undefined,

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
    })),

  deleteSelected: () =>
    set((state) => {
      const { selectedId: id, selectedKind: kind } = state;
      if (!id) return state;
      if (kind === "block") {
        // Detach (don't delete) any arrows connected to the removed block.
        const arrows = state.arrows.map((a) => {
          let next = a;
          if (a.startConnection?.blockId === id) next = { ...next, startConnection: undefined };
          if (a.endConnection?.blockId === id) next = { ...next, endConnection: undefined };
          return next;
        });
        const closingPicker = state.activeLogoPickerBlockId === id;
        return {
          blocks: state.blocks.filter((b) => b.id !== id),
          arrows,
          selectedId: null,
          selectedKind: null,
          activeLogoPickerBlockId: closingPicker ? undefined : state.activeLogoPickerBlockId,
          activeLogoPickerAIType: closingPicker ? undefined : state.activeLogoPickerAIType,
        };
      }
      if (kind === "arrow") {
        return {
          arrows: state.arrows.filter((a) => a.id !== id),
          selectedId: null,
          selectedKind: null,
        };
      }
      if (kind === "image") {
        return {
          images: state.images.filter((im) => im.id !== id),
          selectedId: null,
          selectedKind: null,
        };
      }
      return state;
    }),

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
          ? {
              ...a,
              [endpoint === "start" ? "startConnection" : "endConnection"]: connection,
            }
          : a
      ),
    })),

  addImageElement: (image) =>
    set((state) => ({
      images: [...state.images, image],
      selectedId: image.id,
      selectedKind: "image",
    })),

  updateImageElement: (id, patch) =>
    set((state) => ({
      images: state.images.map((im) => (im.id === id ? { ...im, ...patch } : im)),
    })),

  openLogoPicker: (blockId, aiType) =>
    set({ activeLogoPickerBlockId: blockId, activeLogoPickerAIType: aiType }),

  closeLogoPicker: () =>
    set({ activeLogoPickerBlockId: undefined, activeLogoPickerAIType: undefined }),

  setSelectedLogo: (blockId, logo) =>
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.id === blockId ? { ...b, selectedLogo: logo } : b
      ),
    })),

  clearSelectedLogo: (blockId) =>
    set((state) => ({
      blocks: state.blocks.map((b) =>
        b.id === blockId ? { ...b, selectedLogo: undefined } : b
      ),
    })),
}));

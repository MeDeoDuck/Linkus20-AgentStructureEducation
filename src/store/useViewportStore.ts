/**
 * 캔버스 뷰포트 상태: 줌(Ctrl+휠) + 우클릭 컨텍스트 메뉴.
 * 다이어그램 데이터(useDiagramStore)와 분리된 순수 UI/뷰 상태.
 */
import { create } from "zustand";
import type { ElementRef } from "../types";

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3.0;
export const DEFAULT_ZOOM = 1.0;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export interface ContextMenuState {
  x: number;
  y: number;
  ref: ElementRef;
}

interface ViewportState {
  zoom: number;
  contextMenu: ContextMenuState | null;

  setZoom: (z: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;

  openContextMenu: (x: number, y: number, ref: ElementRef) => void;
  closeContextMenu: () => void;
}

export const useViewportStore = create<ViewportState>((set) => ({
  zoom: DEFAULT_ZOOM,
  contextMenu: null,

  setZoom: (z) => set({ zoom: clampZoom(z) }),
  zoomIn: () => set((s) => ({ zoom: clampZoom(s.zoom + 0.1) })),
  zoomOut: () => set((s) => ({ zoom: clampZoom(s.zoom - 0.1) })),
  resetZoom: () => set({ zoom: DEFAULT_ZOOM }),

  openContextMenu: (x, y, ref) => set({ contextMenu: { x, y, ref } }),
  closeContextMenu: () => set((s) => (s.contextMenu ? { contextMenu: null } : s)),
}));

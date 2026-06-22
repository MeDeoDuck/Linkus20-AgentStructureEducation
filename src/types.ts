export type BlockType = "user" | "rectangle" | "diamond" | "rounded";
export type AIType = "generative" | "speechToText" | "textToImage" | "imageOrTextToVideo" | "custom";

export interface LogoItem {
  name: string;
  logoUrl?: string;
}

export interface DiagramBlock {
  id: string;
  type: BlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  aiType?: AIType;
  /** The single logo chosen from the bottom-sheet picker (replaces the old logos[]). */
  selectedLogo?: LogoItem;
}

export type AnchorName =
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

export interface ArrowConnection {
  blockId: string;
  anchor: AnchorName;
}

export interface ArrowElement {
  id: string;
  x: number;
  y: number;
  width: number;
  rotation: number;
  curve: number;
  startConnection?: ArrowConnection;
  endConnection?: ArrowConnection;
}

export interface ImageElement {
  id: string;
  type: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  fileName?: string;
  aspectRatio?: number;
}

export type SelectedKind = "block" | "arrow" | "image" | null;

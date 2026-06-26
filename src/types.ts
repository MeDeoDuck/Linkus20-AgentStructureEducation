export type BlockType = "user" | "rectangle" | "diamond" | "rounded";
export type AIType = "generative" | "speechToText" | "textToImage" | "imageOrTextToVideo" | "custom";

/** 노드의 실행 역할(P1). 없으면(undefined) 기존처럼 "그림 전용" 블록. */
export type NodeRole = "input" | "llm" | "tool" | "condition" | "output";

/** 역할별 실행 설정(P1). 모든 필드 optional — 하위호환을 위해 부분적으로만 채워질 수 있다. */
export interface NodeConfig {
  // llm
  model?: string;
  temperature?: number;
  maxTokens?: number;
  // tool
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  // condition
  expression?: string;
  // input
  inputType?: "text" | "file" | "url";
  placeholder?: string;
}

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
  /** Shared id for grouped elements (Ctrl+G). */
  groupId?: string;
  /** Layer order (Photoshop-style). Higher = drawn on top. */
  zIndex: number;
  /** 실행 역할(P1). 없으면 그림 전용 블록(하위호환). */
  nodeRole?: NodeRole;
  /** 역할별 실행 설정(P1). */
  config?: NodeConfig;
  /** llm 역할 등에서 사용하는 프롬프트(P1). */
  prompt?: string;
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
  groupId?: string;
  /** Optional edge label (set by the AI Assistant when creating connections). */
  label?: string;
  /** Layer order (Photoshop-style). Higher = drawn on top. */
  zIndex: number;
  /** 엣지 종류(P1): 데이터 흐름 vs 제어 흐름. 없으면 미지정(하위호환). */
  edgeKind?: "data" | "control";
  /** condition 노드에서 분기되는 가지(P1). */
  conditionBranch?: "true" | "false";
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
  groupId?: string;
  /** Layer order (Photoshop-style). Higher = drawn on top. */
  zIndex: number;
}

export type SelectedKind = "block" | "arrow" | "image";

/** A reference to one selectable object (multi-selection element). */
export interface ElementRef {
  type: SelectedKind;
  id: string;
}

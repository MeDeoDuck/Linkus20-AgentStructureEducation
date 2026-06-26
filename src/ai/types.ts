/**
 * AI Assistant 도메인 타입.
 * 캔버스 내부 모델(blocks/arrows/images)과 분리된, AI가 읽고 쓰는 단순 그래프 표현.
 * 변환은 diagramBridge.ts 가 담당한다.
 */

/** AI가 다루는 블록 타입. 요구사항의 "rounded-rectangle"은 코드의 "rounded"로 정규화된다. */
export type AINodeType = "user" | "rectangle" | "diamond" | "rounded";

import type { NodeConfig, NodeRole } from "../types";

export interface AINode {
  id: string;
  type: AINodeType;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  /** Layer order. JSON 저장/복원용(없으면 불러올 때 순서대로 부여). */
  zIndex?: number;
  /** 실행 역할(P1). 없으면 그림 전용(하위호환). */
  nodeRole?: NodeRole;
  /** 역할별 실행 설정(P1). */
  config?: NodeConfig;
  /** llm 역할 등에서 사용하는 프롬프트(P1). */
  prompt?: string;
}

export interface AIEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  /** Layer order. JSON 저장/복원용. */
  zIndex?: number;
  /** 엣지 종류(P1): 데이터 흐름 vs 제어 흐름. */
  edgeKind?: "data" | "control";
  /** condition 노드에서 분기되는 가지(P1). */
  conditionBranch?: "true" | "false";
}

export interface DiagramGraph {
  nodes: AINode[];
  edges: AIEdge[];
}

/** AI가 반환하는 변경 연산. 적용 전까지 캔버스에 반영되지 않는다. */
export type Operation =
  | { type: "addNode"; node: AINode }
  | { type: "updateNode"; id: string; patch: Partial<Omit<AINode, "id">> }
  | { type: "deleteNode"; id: string }
  | { type: "addEdge"; edge: AIEdge }
  | { type: "updateEdge"; id: string; patch: Partial<Omit<AIEdge, "id">> }
  | { type: "deleteEdge"; id: string }
  | { type: "moveNode"; id: string; x: number; y: number }
  | { type: "layoutDiagram"; direction?: "LR" | "TB" };

export type OperationType = Operation["type"];

export const OPERATION_TYPES: OperationType[] = [
  "addNode",
  "updateNode",
  "deleteNode",
  "addEdge",
  "updateEdge",
  "deleteEdge",
  "moveNode",
  "layoutDiagram",
];

/** provider 에 전달하는 요청. 이번 버전은 GitHub Copilot 단일 경로(모델 선택 없음). */
export interface DiagramAIRequest {
  /** 사용자의 자연어 요청. */
  prompt: string;
  /** 현재 캔버스 상태(단순 그래프). */
  diagram: DiagramGraph;
  /** 사용 가능한 블록 타입 목록(외부 표기: rounded-rectangle). */
  availableNodeTypes: string[];
  /** 현재 선택된 블록 정보(없으면 비어 있음). */
  selectedNodes: AINode[];
  /** 현재 선택된 블록 id(없으면 null). */
  selectedNodeId: string | null;
}

/** provider 가 반환하는 응답. */
export interface DiagramAIResponse {
  message: string;
  operations: Operation[];
}

/** 모든 provider 가 따르는 공통 인터페이스. */
export interface AIProvider {
  name: string;
  generateDiagramEdit(input: DiagramAIRequest): Promise<DiagramAIResponse>;
}

/** 대화 기록 한 줄. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  /** assistant 메시지에 동봉된 제안(있으면 미리보기에 사용). */
  operations?: Operation[];
  /** 적용 여부 표시. */
  applied?: boolean;
}

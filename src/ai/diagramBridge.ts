/**
 * 캔버스 내부 모델(DiagramBlock/ArrowElement) ↔ AI 그래프(AINode/AIEdge) 변환,
 * 그리고 AI operations 의 검증·적용을 담당하는 순수 로직 계층.
 *
 * 안전 원칙: operations 는 먼저 validateOperations 로 검증한 뒤에만 applyOperations 로
 * 반영한다. 존재하지 않는 id 참조나 잘못된 타입은 errors 로 막는다.
 */
import type { ArrowElement, BlockType, DiagramBlock } from "../types";
import { anchorPoint, endpointsToArrow, reconcileArrow } from "../utils/anchors";
import type { AIEdge, AINode, AINodeType, DiagramGraph, Operation } from "./types";

export const AVAILABLE_NODE_TYPES: AINodeType[] = ["user", "rectangle", "diamond", "rounded"];

const DEFAULT_SIZE: Record<AINodeType, { width: number; height: number }> = {
  user: { width: 110, height: 110 },
  rectangle: { width: 160, height: 90 },
  diamond: { width: 140, height: 100 },
  rounded: { width: 160, height: 90 },
};

/** "rounded-rectangle" 같은 별칭을 코드 타입으로 정규화. 유효하지 않으면 null. */
export function normalizeNodeType(raw: string): AINodeType | null {
  const t = raw?.toLowerCase().trim();
  if (t === "user") return "user";
  if (t === "rectangle" || t === "rect") return "rectangle";
  if (t === "diamond") return "diamond";
  if (t === "rounded" || t === "rounded-rectangle" || t === "roundedrectangle") return "rounded";
  return null;
}

// ---------------------------------------------------------------------------
// 캔버스 → AI 그래프
// ---------------------------------------------------------------------------

export function blockToNode(b: DiagramBlock): AINode {
  return { id: b.id, type: b.type, x: b.x, y: b.y, width: b.width, height: b.height, label: b.text, zIndex: b.zIndex };
}

/** 양끝이 모두 블록에 연결된 화살표만 edge 로 노출(source/target 가 필요하므로). */
export function toGraph(blocks: DiagramBlock[], arrows: ArrowElement[]): DiagramGraph {
  const nodes = blocks.map(blockToNode);
  const edges: AIEdge[] = [];
  for (const a of arrows) {
    if (a.startConnection && a.endConnection) {
      edges.push({
        id: a.id,
        source: a.startConnection.blockId,
        target: a.endConnection.blockId,
        label: a.label,
        zIndex: a.zIndex,
      });
    }
  }
  return { nodes, edges };
}

/** slice 내 최대 zIndex(새 요소 배치용). */
const sliceMaxZ = (blocks: DiagramBlock[], arrows: ArrowElement[]): number =>
  Math.max(0, ...blocks.map((b) => b.zIndex ?? 0), ...arrows.map((a) => a.zIndex ?? 0));

// ---------------------------------------------------------------------------
// 검증
// ---------------------------------------------------------------------------

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/**
 * operations 를 순차 시뮬레이션하며 검증. 같은 배치에서 addNode 로 추가된 id 는
 * 이후 addEdge 가 참조할 수 있으므로 누적 집합으로 추적한다.
 */
export function validateOperations(ops: Operation[], graph: DiagramGraph): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  const edgeIds = new Set(graph.edges.map((e) => e.id));

  ops.forEach((op, i) => {
    const at = `operation[${i}] (${op.type})`;
    switch (op.type) {
      case "addNode": {
        if (!op.node?.id) errors.push(`${at}: node.id 누락`);
        else if (nodeIds.has(op.node.id)) warnings.push(`${at}: 이미 존재하는 node id "${op.node.id}" — 덮어씁니다`);
        if (!normalizeNodeType(op.node?.type ?? "")) errors.push(`${at}: 허용되지 않는 타입 "${op.node?.type}"`);
        for (const k of ["x", "y", "width", "height"] as const) {
          const v = op.node?.[k];
          if (v !== undefined && !Number.isFinite(v)) errors.push(`${at}: ${k} 값이 유효한 숫자가 아닙니다`);
        }
        if (op.node?.id) nodeIds.add(op.node.id);
        break;
      }
      case "updateNode":
      case "moveNode":
        if (!nodeIds.has(op.id)) errors.push(`${at}: 존재하지 않는 node id "${op.id}"`);
        if (op.type === "updateNode" && op.patch?.type && !normalizeNodeType(op.patch.type)) {
          errors.push(`${at}: 허용되지 않는 타입 "${op.patch.type}"`);
        }
        if (op.type === "moveNode" && (!Number.isFinite(op.x) || !Number.isFinite(op.y))) {
          errors.push(`${at}: 이동 좌표(x, y)가 유효한 숫자가 아닙니다`);
        }
        break;
      case "deleteNode":
        if (!nodeIds.has(op.id)) errors.push(`${at}: 존재하지 않는 node id "${op.id}"`);
        else nodeIds.delete(op.id);
        break;
      case "addEdge": {
        const e = op.edge;
        if (!e?.id) errors.push(`${at}: edge.id 누락`);
        else if (edgeIds.has(e.id)) warnings.push(`${at}: 이미 존재하는 edge id "${e.id}" — 덮어씁니다`);
        if (!nodeIds.has(e?.source)) errors.push(`${at}: source 노드 "${e?.source}" 없음`);
        if (!nodeIds.has(e?.target)) errors.push(`${at}: target 노드 "${e?.target}" 없음`);
        if (e?.id) edgeIds.add(e.id);
        break;
      }
      case "updateEdge":
        if (!edgeIds.has(op.id)) errors.push(`${at}: 존재하지 않는 edge id "${op.id}"`);
        if (op.patch?.source && !nodeIds.has(op.patch.source)) errors.push(`${at}: source 노드 "${op.patch.source}" 없음`);
        if (op.patch?.target && !nodeIds.has(op.patch.target)) errors.push(`${at}: target 노드 "${op.patch.target}" 없음`);
        break;
      case "deleteEdge":
        if (!edgeIds.has(op.id)) errors.push(`${at}: 존재하지 않는 edge id "${op.id}"`);
        else edgeIds.delete(op.id);
        break;
      case "layoutDiagram":
        break;
      default:
        errors.push(`${at}: 알 수 없는 operation 타입`);
    }
  });

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// 적용 (순수 함수: 현재 상태 + ops → 새 상태)
// ---------------------------------------------------------------------------

export interface DiagramSlice {
  blocks: DiagramBlock[];
  arrows: ArrowElement[];
}

function nodeToBlock(node: AINode): DiagramBlock {
  const type = (normalizeNodeType(node.type) ?? "rectangle") as BlockType;
  const size = DEFAULT_SIZE[type];
  return {
    id: node.id,
    type,
    x: node.x ?? 80,
    y: node.y ?? 80,
    width: node.width ?? size.width,
    height: node.height ?? size.height,
    text: node.label ?? "",
    zIndex: node.zIndex ?? 0,
  };
}

/** source/target 블록 위치로 알맞은 양끝 anchor 를 골라 화살표를 만든다(왼→오 흐름 우선). */
function makeArrow(id: string, source: DiagramBlock, target: DiagramBlock, label: string | undefined, zIndex: number): ArrowElement {
  const horizontal = Math.abs(target.x - source.x) >= Math.abs(target.y - source.y);
  const startAnchor = horizontal ? (target.x >= source.x ? "right" : "left") : target.y >= source.y ? "bottom" : "top";
  const endAnchor = horizontal ? (target.x >= source.x ? "left" : "right") : target.y >= source.y ? "top" : "bottom";
  const start = anchorPoint(source, startAnchor);
  const end = anchorPoint(target, endAnchor);
  const base: ArrowElement = {
    id,
    ...endpointsToArrow(start, end),
    curve: 0,
    startConnection: { blockId: source.id, anchor: startAnchor },
    endConnection: { blockId: target.id, anchor: endAnchor },
    label,
    zIndex,
  };
  return base;
}

/** edge 들을 기반으로 한 좌→우(LR) 또는 위→아래(TB) 흐름 자동 배치. */
function layout(blocks: DiagramBlock[], arrows: ArrowElement[], direction: "LR" | "TB"): DiagramBlock[] {
  if (!blocks.length) return blocks;
  const ids = blocks.map((b) => b.id);
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const a of arrows) {
    const s = a.startConnection?.blockId;
    const t = a.endConnection?.blockId;
    if (s && t && indeg.has(s) && indeg.has(t)) {
      adj.get(s)!.push(t);
      indeg.set(t, (indeg.get(t) ?? 0) + 1);
    }
  }
  // BFS 레벨 매기기(사이클은 무시하고 방문 1회).
  const level = new Map<string, number>();
  const queue: string[] = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  // 순수 사이클이면 indeg 0 노드가 없어 시드가 빈다 → 첫 노드를 강제 시드로.
  if (queue.length === 0 && ids.length) queue.push(ids[0]);
  queue.forEach((id) => level.set(id, 0));
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const lv = level.get(id) ?? 0;
    for (const next of adj.get(id) ?? []) {
      if (!level.has(next)) {
        level.set(next, lv + 1);
        queue.push(next);
      }
    }
  }
  ids.forEach((id) => { if (!level.has(id)) level.set(id, 0); });

  // 레벨별로 분류 후 좌표 배치.
  const byLevel = new Map<number, string[]>();
  for (const id of ids) {
    const lv = level.get(id) ?? 0;
    if (!byLevel.has(lv)) byLevel.set(lv, []);
    byLevel.get(lv)!.push(id);
  }
  const GAP_MAIN = direction === "LR" ? 240 : 160;
  const GAP_CROSS = direction === "LR" ? 150 : 220;
  const ORIGIN = 80;
  const pos = new Map<string, { x: number; y: number }>();
  for (const [lv, group] of byLevel) {
    group.forEach((id, idx) => {
      pos.set(id, direction === "LR"
        ? { x: ORIGIN + lv * GAP_MAIN, y: ORIGIN + idx * GAP_CROSS }
        : { x: ORIGIN + idx * GAP_CROSS, y: ORIGIN + lv * GAP_MAIN });
    });
  }
  return blocks.map((b) => {
    const p = pos.get(b.id);
    return p ? { ...b, x: p.x, y: p.y } : b;
  });
}

/** 검증을 통과한 operations 를 순서대로 적용해 새 blocks/arrows 를 만든다. */
export function applyOperations(slice: DiagramSlice, ops: Operation[]): DiagramSlice {
  let blocks = [...slice.blocks];
  let arrows = [...slice.arrows];
  const reconcileFor = (blockId: string) => {
    arrows = arrows.map((a) =>
      a.startConnection?.blockId === blockId || a.endConnection?.blockId === blockId
        ? reconcileArrow(a, blocks)
        : a
    );
  };

  for (const op of ops) {
    switch (op.type) {
      case "addNode": {
        const nb = nodeToBlock(op.node);
        if (op.node.zIndex == null) nb.zIndex = sliceMaxZ(blocks, arrows) + 1; // 새 노드는 맨 위로
        blocks = [...blocks.filter((b) => b.id !== nb.id), nb];
        break;
      }
      case "updateNode": {
        blocks = blocks.map((b) => {
          if (b.id !== op.id) return b;
          // 알려진 필드만 화이트리스트 적용(임의 키 오염 방지).
          const { x, y, width, height, label, type } = op.patch;
          const next: DiagramBlock = { ...b };
          if (Number.isFinite(x)) next.x = x as number;
          if (Number.isFinite(y)) next.y = y as number;
          if (Number.isFinite(width)) next.width = width as number;
          if (Number.isFinite(height)) next.height = height as number;
          if (label !== undefined) next.text = label;
          if (type) next.type = (normalizeNodeType(type) ?? b.type) as BlockType;
          return next;
        });
        reconcileFor(op.id);
        break;
      }
      case "deleteNode": {
        blocks = blocks.filter((b) => b.id !== op.id);
        arrows = arrows.filter(
          (a) => a.startConnection?.blockId !== op.id && a.endConnection?.blockId !== op.id
        );
        break;
      }
      case "moveNode": {
        blocks = blocks.map((b) => (b.id === op.id ? { ...b, x: op.x, y: op.y } : b));
        reconcileFor(op.id);
        break;
      }
      case "addEdge": {
        const source = blocks.find((b) => b.id === op.edge.source);
        const target = blocks.find((b) => b.id === op.edge.target);
        if (source && target) {
          const z = op.edge.zIndex ?? sliceMaxZ(blocks, arrows) + 1;
          arrows = [...arrows.filter((a) => a.id !== op.edge.id), makeArrow(op.edge.id, source, target, op.edge.label, z)];
        } else {
          // validateOperations 를 통과했다면 도달하지 않는다(미리보기 개수와 어긋나지 않도록 알림).
          console.warn(`[applyOperations] addEdge 누락: source/target 블록을 찾지 못함 (${op.edge.source}→${op.edge.target})`);
        }
        break;
      }
      case "updateEdge": {
        arrows = arrows.map((a) => {
          if (a.id !== op.id) return a;
          const label = op.patch.label !== undefined ? op.patch.label : a.label;
          // source/target 가 바뀌면 addEdge 와 동일하게 위치 기반 anchor 를 재선출.
          if (op.patch.source || op.patch.target) {
            const srcId = op.patch.source ?? a.startConnection?.blockId;
            const tgtId = op.patch.target ?? a.endConnection?.blockId;
            const src = blocks.find((b) => b.id === srcId);
            const tgt = blocks.find((b) => b.id === tgtId);
            if (src && tgt) return makeArrow(a.id, src, tgt, label, a.zIndex); // 기존 레이어 보존
          }
          return reconcileArrow({ ...a, label }, blocks);
        });
        break;
      }
      case "deleteEdge": {
        arrows = arrows.filter((a) => a.id !== op.id);
        break;
      }
      case "layoutDiagram": {
        blocks = layout(blocks, arrows, op.direction ?? "LR");
        arrows = arrows.map((a) =>
          a.startConnection || a.endConnection ? reconcileArrow(a, blocks) : a
        );
        break;
      }
    }
  }
  return { blocks, arrows };
}

/** 미리보기용: operations 를 사람이 읽을 한 줄 요약으로. 외부(AI) 입력이라 방어적으로 접근. */
export function summarizeOperation(op: Operation): string {
  try {
    const o = op as Record<string, any>;
    switch (o?.type) {
      case "addNode":
        return `+ 블록 추가: "${o.node?.label ?? "?"}" (${o.node?.type ?? "?"})`;
      case "updateNode":
        return `~ 블록 수정: ${o.id}${o.patch?.label ? ` → "${o.patch.label}"` : ""}`;
      case "deleteNode":
        return `- 블록 삭제: ${o.id}`;
      case "moveNode":
        return `→ 블록 이동: ${o.id} (${o.x}, ${o.y})`;
      case "addEdge":
        return `+ 연결 추가: ${o.edge?.source ?? "?"} → ${o.edge?.target ?? "?"}${o.edge?.label ? ` "${o.edge.label}"` : ""}`;
      case "updateEdge":
        return `~ 연결 수정: ${o.id}`;
      case "deleteEdge":
        return `- 연결 삭제: ${o.id}`;
      case "layoutDiagram":
        return `⟲ 자동 정렬 (${o.direction ?? "LR"})`;
      default:
        return `알 수 없는 변경: ${o?.type ?? "?"}`;
    }
  } catch {
    return "변경 요약 불가";
  }
}

// ---------------------------------------------------------------------------
// 외부 계약(JSON 저장 / AI 전송) ↔ 내부 모델
// 내부 타입 "rounded" ↔ 외부 표기 "rounded-rectangle"
// ---------------------------------------------------------------------------

/** AI/JSON 에 노출하는 블록 타입 목록(외부 표기). */
export const EXTERNAL_NODE_TYPES = ["user", "rectangle", "diamond", "rounded-rectangle"] as const;

export function toExternalType(t: AINodeType): string {
  return t === "rounded" ? "rounded-rectangle" : t;
}

/** 내부 그래프를 외부 계약(rounded-rectangle 표기)으로 직렬화. JSON 저장 / AI 전송용. */
export function serializeGraph(graph: DiagramGraph): {
  nodes: Array<Omit<AINode, "type"> & { type: string }>;
  edges: AIEdge[];
} {
  return {
    nodes: graph.nodes.map((n) => ({ ...n, type: toExternalType(n.type) })),
    edges: graph.edges,
  };
}

/**
 * 신뢰할 수 없는 JSON(파일 업로드)을 엄격 검증해 DiagramGraph 로 파싱.
 * 구조/필수필드/타입이 어긋나면 throw(호출부가 사용자에게 안내). 좌표·크기는 안전 기본값으로 보정.
 */
export function parseDiagramGraph(raw: unknown): DiagramGraph {
  const r = raw as { nodes?: unknown; edges?: unknown };
  if (!r || typeof r !== "object" || !Array.isArray(r.nodes)) {
    throw new Error("nodes 배열을 가진 다이어그램 JSON이 아닙니다.");
  }
  let zc = 1; // zIndex 누락 시 순서대로 부여(JSON 호환).
  const nodes: AINode[] = r.nodes.map((raw_n: unknown) => {
    const n = raw_n as Record<string, unknown>;
    if (!n || typeof n.id !== "string" || !n.id) throw new Error("각 node에는 문자열 id가 필요합니다.");
    const t = normalizeNodeType(String(n.type ?? ""));
    if (!t) throw new Error(`허용되지 않는 블록 타입: "${String(n.type)}"`);
    const size = DEFAULT_SIZE[t];
    const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);
    return {
      id: n.id,
      type: t,
      x: typeof n.x === "number" && Number.isFinite(n.x) ? n.x : 80,
      y: typeof n.y === "number" && Number.isFinite(n.y) ? n.y : 80,
      width: num(n.width, size.width),
      height: num(n.height, size.height),
      label: typeof n.label === "string" ? n.label : "",
      zIndex: typeof n.zIndex === "number" && Number.isFinite(n.zIndex) ? n.zIndex : zc++,
    };
  });
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) throw new Error(`중복된 node id: "${n.id}"`);
    seen.add(n.id);
  }
  const rawEdges = Array.isArray(r.edges) ? r.edges : [];
  const edges: AIEdge[] = rawEdges
    .map((raw_e: unknown) => raw_e as Record<string, unknown>)
    .filter((e) => e && typeof e.id === "string" && typeof e.source === "string" && typeof e.target === "string")
    .map((e) => ({
      id: e.id as string,
      source: e.source as string,
      target: e.target as string,
      label: typeof e.label === "string" ? e.label : undefined,
      zIndex: typeof e.zIndex === "number" && Number.isFinite(e.zIndex) ? (e.zIndex as number) : zc++,
    }));
  return { nodes, edges };
}

/** 외부 그래프(JSON)를 캔버스 슬라이스로 복원. 불러오기용. type 은 normalize 처리. */
export function graphToSlice(graph: DiagramGraph): DiagramSlice {
  const blocks = (graph.nodes ?? []).map(nodeToBlock);
  const arrows: ArrowElement[] = [];
  for (const e of graph.edges ?? []) {
    const s = blocks.find((b) => b.id === e.source);
    const t = blocks.find((b) => b.id === e.target);
    if (s && t) arrows.push(makeArrow(e.id, s, t, e.label, e.zIndex ?? 0));
  }
  return { blocks, arrows };
}

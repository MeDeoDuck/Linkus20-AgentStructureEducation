/**
 * Copilot operations 정규화 어댑터.
 *
 * Copilot(agent runtime)은 시스템 프롬프트의 중첩 예시를 안 따르고 평탄 구조 +
 * `nodeType` 키로 반환하는 경향이 있다. 이 어댑터가 평탄/중첩 어느 쪽이 와도
 * 프론트가 기대하는 표준 operation 형식으로 통일한다(프론트는 손대지 않는다).
 *
 * 프론트(diagramBridge) 실제 계약:
 *   addNode    → { type, node:{ id, type, x, y, width, height, label } }
 *   addEdge    → { type, edge:{ id, source, target, label } }
 *   updateNode → { type, id, patch:{ label?, x?, y?, width?, height?, type? } }
 *   moveNode   → { type, id, x, y }
 *   deleteNode → { type, id }
 *   updateEdge → { type, id, patch:{ source?, target?, label? } }
 *   deleteEdge → { type, id }
 *   layoutDiagram → { type, direction:"LR"|"TB" }
 *
 * 안전 원칙: 절대 throw 하지 않는다. 잘못된 op 는 skip + warn(서버 콘솔)만.
 */
import { safeLog } from "../util/logRedact.js";

export const ALLOWED_NODE_TYPES = ["user", "rectangle", "diamond", "rounded-rectangle"] as const;
type NodeType = (typeof ALLOWED_NODE_TYPES)[number];

const DEFAULT_SIZE: Record<NodeType, { width: number; height: number }> = {
  user: { width: 100, height: 100 },
  rectangle: { width: 160, height: 70 },
  diamond: { width: 140, height: 90 },
  "rounded-rectangle": { width: 160, height: 70 },
};

const DEFAULT_LABEL: Record<NodeType, string> = {
  user: "사용자",
  rectangle: "처리",
  diamond: "조건",
  "rounded-rectangle": "단계",
};

/** 별칭(rounded 등)을 표준 타입으로. 허용 외면 null. */
function canonType(raw: unknown): NodeType | null {
  const t = String(raw ?? "").toLowerCase().trim();
  if (t === "user") return "user";
  if (t === "rectangle" || t === "rect") return "rectangle";
  if (t === "diamond") return "diamond";
  if (t === "rounded" || t === "rounded-rectangle" || t === "roundedrectangle") return "rounded-rectangle";
  return null;
}

let genCounter = 0;
const genId = (prefix: string) => `${prefix}-gen-${(genCounter++).toString(36)}`;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const numOr = (v: unknown, fb: number) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
const optNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const strOr = (v: unknown, fb?: string) => (typeof v === "string" ? v : fb);

export interface NormalizedResponse {
  message: string;
  operations: Record<string, unknown>[];
}

export function normalizeDiagramOperations(resp: unknown): NormalizedResponse {
  const r = isObj(resp) ? resp : {};
  const message = strOr(r.message, "") as string;
  const rawOps = Array.isArray(r.operations) ? r.operations : [];
  const operations: Record<string, unknown>[] = [];
  let spawnX = 80;
  const warn = (m: string) => safeLog(`[normalize] ${m}`);

  rawOps.forEach((rawOp, i) => {
    if (!isObj(rawOp) || typeof rawOp.type !== "string") {
      warn(`skip op[${i}]: type 누락/형식오류`);
      return;
    }
    const op = rawOp;
    // 필드 소스 우선순위: 중첩(node/edge) → 평탄(op) → patch.
    const nested = isObj(op.node) ? op.node : isObj(op.edge) ? op.edge : null;
    const patchObj = isObj(op.patch) ? op.patch : null;
    const f = (k: string): unknown => {
      if (nested && k in nested) return nested[k];
      if (k in op && k !== "type") return op[k]; // op.type 은 operation 명령 타입이므로 제외
      if (patchObj && k in patchObj) return patchObj[k];
      return undefined;
    };
    // 노드 타입은 op.type(명령)과 절대 혼동 금지: 중첩이면 node.type, 평탄/patch면 nodeType.
    const rawNodeType = nested
      ? nested.type ?? nested.nodeType
      : op.nodeType ?? (op as Record<string, unknown>).node_type ?? patchObj?.type ?? patchObj?.nodeType;
    const theId = (): string | undefined => strOr(f("id"));

    try {
      switch (op.type) {
        case "addNode": {
          const ct = canonType(rawNodeType);
          if (!ct) {
            warn(`skip addNode[${i}]: 허용되지 않은 노드 타입 "${String(rawNodeType)}"`);
            return;
          }
          const size = DEFAULT_SIZE[ct];
          operations.push({
            type: "addNode",
            node: {
              id: theId() ?? genId("node"),
              type: ct,
              x: numOr(f("x"), spawnX),
              y: numOr(f("y"), 200),
              width: numOr(f("width"), size.width),
              height: numOr(f("height"), size.height),
              label: strOr(f("label"), DEFAULT_LABEL[ct]),
            },
          });
          spawnX += 200;
          return;
        }
        case "addEdge": {
          const source = strOr(f("source"));
          const target = strOr(f("target"));
          if (!source || !target) {
            warn(`skip addEdge[${i}]: source/target 누락`);
            return;
          }
          operations.push({
            type: "addEdge",
            edge: { id: theId() ?? genId("edge"), source, target, label: strOr(f("label"), "") },
          });
          return;
        }
        case "updateNode": {
          const id = theId();
          if (!id) {
            warn(`skip updateNode[${i}]: id 누락`);
            return;
          }
          const patch: Record<string, unknown> = {};
          const ct = canonType(rawNodeType);
          if (ct) patch.type = ct;
          const label = strOr(f("label"));
          if (label !== undefined) patch.label = label;
          const x = optNum(f("x"));
          if (x !== undefined) patch.x = x;
          const y = optNum(f("y"));
          if (y !== undefined) patch.y = y;
          const width = optNum(f("width"));
          if (width !== undefined) patch.width = width;
          const height = optNum(f("height"));
          if (height !== undefined) patch.height = height;
          operations.push({ type: "updateNode", id, patch });
          return;
        }
        case "moveNode": {
          const id = theId();
          const x = optNum(f("x"));
          const y = optNum(f("y"));
          if (!id || x === undefined || y === undefined) {
            warn(`skip moveNode[${i}]: id/좌표 누락`);
            return;
          }
          operations.push({ type: "moveNode", id, x, y });
          return;
        }
        case "deleteNode": {
          const id = theId();
          if (!id) {
            warn(`skip deleteNode[${i}]: id 누락`);
            return;
          }
          operations.push({ type: "deleteNode", id });
          return;
        }
        case "updateEdge": {
          const id = theId();
          if (!id) {
            warn(`skip updateEdge[${i}]: id 누락`);
            return;
          }
          const patch: Record<string, unknown> = {};
          const source = strOr(f("source"));
          if (source !== undefined) patch.source = source;
          const target = strOr(f("target"));
          if (target !== undefined) patch.target = target;
          const label = strOr(f("label"));
          if (label !== undefined) patch.label = label;
          operations.push({ type: "updateEdge", id, patch });
          return;
        }
        case "deleteEdge": {
          const id = theId();
          if (!id) {
            warn(`skip deleteEdge[${i}]: id 누락`);
            return;
          }
          operations.push({ type: "deleteEdge", id });
          return;
        }
        case "layoutDiagram": {
          const dir = f("direction") === "TB" ? "TB" : "LR";
          operations.push({ type: "layoutDiagram", direction: dir });
          return;
        }
        default:
          warn(`skip op[${i}]: 알 수 없는 operation 타입 "${op.type}"`);
      }
    } catch (e) {
      warn(`skip op[${i}]: ${String(e)}`);
    }
  });

  return { message, operations };
}

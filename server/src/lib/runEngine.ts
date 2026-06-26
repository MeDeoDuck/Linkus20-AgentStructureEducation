/**
 * 워크플로 실행 엔진(P2 MVP — 선형/병렬 레이어).
 *
 * 입력: graph(nodes: nodeRole/config/prompt 포함, edges: source→target) + inputs(노드별 초기값).
 * 처리: 위상정렬(순환 검출) → 의존 없는 노드는 같은 레이어에서 병렬 실행 → 노드별 NodeRun 기록.
 * 보안: 실제 모델 호출은 서버의 callModel(운영자 키)로만. 키는 절대 클라이언트로 나가지 않는다.
 *
 * 역할별 처리(MVP):
 *  - input     : ctx[id] = inputs[id]
 *  - llm       : prompt = bindVars(node.prompt, ctx) → callModel → ctx[id] = text
 *  - tool      : 미지원 — 명확히 실패시킴(P4에서 지원 예정)
 *  - condition : 단순 통과(분기는 P4) — ctx[id] = true
 *  - output    : ctx[id] = ctx[첫 입력노드]
 */
import { callModel } from "./copilot.js";
import { runTool } from "./tools.js";
import { safeLog } from "../util/logRedact.js";

export type NodeStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export interface NodeRun {
  nodeId: string;
  status: NodeStatus;
  output?: unknown;
  error?: string;
  tokensIn?: number;
  tokensOut?: number;
  durationMs?: number;
  model?: string;
  /** 비차단 안내(미해결 변수참조 경고, 캐시 재사용 표식 등). 실패가 아닌 부가정보. */
  note?: string;
}

export interface RunGraphNode {
  id: string;
  nodeRole?: string;
  config?: Record<string, unknown>;
  prompt?: string;
  /** 그 외 캔버스 필드(type/x/y...)는 실행에 쓰지 않으므로 무시. */
  [k: string]: unknown;
}

export interface RunGraphEdge {
  source: string;
  target: string;
  /** condition 노드 분기 라벨(P1). true/false 가지. 없으면 항상 따름(하위호환). */
  conditionBranch?: "true" | "false";
  [k: string]: unknown;
}

export interface RunGraph {
  nodes: RunGraphNode[];
  edges: RunGraphEdge[];
}

export interface WorkflowResult {
  nodeRuns: NodeRun[];
  finalOutput?: unknown;
  totalTokens?: number;
}

/** 레이어 내 동시 실행 상한(운영자 키 비용 폭증·DoS 방어). */
const LAYER_CONCURRENCY = 5;

/**
 * items 를 최대 limit 개씩 동시 실행하며 원래 순서대로 결과 배열을 돌려준다.
 * (Promise.all 무제한 대체 — 워커 풀 방식.)
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) || 0 }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** {{nodeId}} / {{nodeId.output}} 를 ctx 값으로 치환. 미해결 참조는 그대로 남기고 경고 수집. */
export function bindVars(
  template: string,
  ctx: Record<string, unknown>,
): { text: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const text = template.replace(/\{\{\s*([\w-]+)(?:\.output)?\s*\}\}/g, (_m, id: string) => {
    if (Object.prototype.hasOwnProperty.call(ctx, id) && ctx[id] !== undefined) {
      return stringify(ctx[id]);
    }
    unresolved.push(id);
    return `{{${id}}}`; // 미해결은 빈문자 대신 원형 유지(디버깅 가능하게)
  });
  return { text, unresolved };
}

/** 따옴표 리터럴이면 벗기고, 아니면 그대로 trim. */
function stripQuotes(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && ((s[0] === "'" && s.at(-1) === "'") || (s[0] === '"' && s.at(-1) === '"'))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * 안전한 조건식 평가기. **eval()/Function() 절대 미사용** — 단순 토큰 파서.
 * 지원: `{{ref}} contains '값'`, `{{ref}} includes '값'`, `{{ref}} == '값'`, `{{ref}} != '값'`,
 *       그리고 연산자 없는 `{{ref}}` 단독(truthy 체크). 좌변은 bindVars 로 ctx 값 문자열화.
 * 파싱 실패/빈식이면 value=false + note(중단하지 않음).
 */
export function evalExpression(
  expression: string | undefined,
  ctx: Record<string, unknown>,
): { value: boolean; note?: string } {
  const expr = (expression ?? "").trim();
  if (!expr) return { value: false, note: "빈 조건식 — false 로 처리" };

  // 연산자 우선순위(단어연산자/2글자 기호). != 를 == 보다 먼저.
  const ops: { sym: string; word: boolean; fn: (a: string, b: string) => boolean }[] = [
    { sym: "contains", word: true, fn: (a, b) => a.includes(b) },
    { sym: "includes", word: true, fn: (a, b) => a.includes(b) },
    { sym: "!=", word: false, fn: (a, b) => a !== b },
    { sym: "==", word: false, fn: (a, b) => a === b },
  ];

  for (const op of ops) {
    const idx = op.word
      ? (() => {
          const m = expr.match(new RegExp(`\\b${op.sym}\\b`));
          return m ? m.index ?? -1 : -1;
        })()
      : expr.indexOf(op.sym);
    if (idx >= 0) {
      const lhsRaw = expr.slice(0, idx).trim();
      const rhsRaw = expr.slice(idx + op.sym.length).trim();
      if (!rhsRaw) return { value: false, note: `조건식 우변이 비어 있습니다: "${expr}"` };
      const lhs = bindVars(lhsRaw, ctx).text.trim();
      const rhs = stripQuotes(rhsRaw);
      return { value: op.fn(lhs, rhs) };
    }
  }

  // 연산자 없음 → 해석값 truthy 체크.
  const v = bindVars(expr, ctx).text.trim().toLowerCase();
  return { value: v !== "" && v !== "false" && v !== "0" && v !== "undefined" && v !== "null" };
}

function stringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * 위상정렬. 순환이 있으면 throw. (Kahn 알고리즘)
 */
export function topoSort(graph: RunGraph): string[] {
  const ids = graph.nodes.map((n) => n.id);
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of graph.edges) {
    if (indeg.has(e.source) && indeg.has(e.target) && e.source !== e.target) {
      adj.get(e.source)!.push(e.target);
      indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    }
  }
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const order: string[] = [];
  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    order.push(id);
    for (const next of adj.get(id) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 0) - 1);
      if ((indeg.get(next) ?? 0) === 0) queue.push(next);
    }
  }
  if (order.length !== ids.length) {
    throw new Error("그래프에 순환(cycle)이 있어 실행할 수 없습니다.");
  }
  return order;
}

/**
 * 의존 없는 노드들을 같은 레이어로 묶는다(레이어 내부는 병렬 실행 가능). 순환 시 throw.
 */
export function parallelLayers(graph: RunGraph): string[][] {
  topoSort(graph); // 순환 검출(throw)
  const ids = graph.nodes.map((n) => n.id);
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of graph.edges) {
    if (indeg.has(e.source) && indeg.has(e.target) && e.source !== e.target) {
      adj.get(e.source)!.push(e.target);
      indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1);
    }
  }
  const layers: string[][] = [];
  let frontier = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const remaining = new Set(ids);
  while (frontier.length) {
    layers.push(frontier);
    const next: string[] = [];
    for (const id of frontier) {
      remaining.delete(id);
      for (const m of adj.get(id) ?? []) {
        indeg.set(m, (indeg.get(m) ?? 0) - 1);
        if ((indeg.get(m) ?? 0) === 0) next.push(m);
      }
    }
    frontier = next;
  }
  return layers;
}

/** 들어오는 엣지의 source 중 ctx 에 값이 있는 첫 source 값을, 없으면 첫 엣지 source 값을 반환. */
function pickIncomingValue(nodeId: string, graph: RunGraph, ctx: Record<string, unknown>): unknown {
  const incomings = graph.edges.filter((e) => e.target === nodeId);
  const withVal = incomings.find((e) => ctx[e.source] !== undefined);
  const chosen = withVal ?? incomings[0];
  return chosen ? ctx[chosen.source] : undefined;
}

/** 단일 노드 실행. ctx 를 직접 갱신하고 NodeRun 을 반환(throw 하지 않고 실패도 NodeRun 으로). */
async function runNode(
  node: RunGraphNode,
  graph: RunGraph,
  inputs: Record<string, unknown>,
  ctx: Record<string, unknown>,
): Promise<NodeRun> {
  const started = Date.now();
  const base: NodeRun = { nodeId: node.id, status: "running" };
  const role = node.nodeRole;
  const config = (node.config ?? {}) as Record<string, unknown>;

  try {
    if (role === "input") {
      const v = inputs[node.id];
      ctx[node.id] = v;
      return { ...base, status: "succeeded", output: v, durationMs: Date.now() - started };
    }

    if (role === "llm") {
      const tmpl = typeof node.prompt === "string" ? node.prompt : "";
      const { text: prompt, unresolved } = bindVars(tmpl, ctx);
      // 미해결 변수참조는 기능 중단 없이 경고만(프롬프트엔 {{id}} 표식이 그대로 남음).
      let note: string | undefined;
      if (unresolved.length) {
        note = `미해결 변수참조: ${[...new Set(unresolved)].map((id) => `{{${id}}}`).join(", ")}`;
        safeLog(`[run] node ${node.id} ${note}`);
      }
      const r = await callModel({
        prompt,
        model: typeof config.model === "string" ? config.model : undefined,
        temperature: typeof config.temperature === "number" ? config.temperature : undefined,
        maxTokens: typeof config.maxTokens === "number" ? config.maxTokens : undefined,
      });
      ctx[node.id] = r.text;
      return {
        ...base,
        status: "succeeded",
        output: r.text,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        model: r.model,
        durationMs: Date.now() - started,
        note,
      };
    }

    if (role === "tool") {
      const toolName = typeof config.toolName === "string" ? config.toolName : "";
      const rawArgs = config.toolArgs && typeof config.toolArgs === "object" ? (config.toolArgs as Record<string, unknown>) : {};
      // 문자열 인자의 {{ref}} 는 여기서 ctx 로 해석해 넘긴다(tools.ts 는 ctx 비의존).
      const resolvedArgs: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawArgs)) {
        resolvedArgs[k] = typeof v === "string" ? bindVars(v, ctx).text : v;
      }
      const out = await runTool(toolName, resolvedArgs);
      ctx[node.id] = out;
      return { ...base, status: "succeeded", output: out, durationMs: Date.now() - started };
    }

    if (role === "condition") {
      // 안전 파서로 expression 평가 → boolean. eval 미사용.
      const expr = typeof config.expression === "string" ? config.expression : undefined;
      const { value, note } = evalExpression(expr, ctx);
      ctx[node.id] = value;
      // 나가는 분기 엣지가 2개 초과면 경고(거부는 아님, MVP 관대).
      const outBranches = graph.edges.filter((e) => e.source === node.id);
      const extraNote =
        outBranches.length > 2 ? `${note ? note + " · " : ""}나가는 엣지 ${outBranches.length}개(분기는 보통 2개)` : note;
      return { ...base, status: "succeeded", output: value, durationMs: Date.now() - started, note: extraNote };
    }

    if (role === "output") {
      // 들어오는 엣지 중 값이 있는 source 를 우선(분기 머지 대응), 없으면 첫 엣지.
      const srcVal = pickIncomingValue(node.id, graph, ctx);
      ctx[node.id] = srcVal;
      return { ...base, status: "succeeded", output: srcVal, durationMs: Date.now() - started };
    }

    // nodeRole 없음(그림 전용) → 실행 대상 아님. 통과 처리(이전 노드 값 전달).
    const passVal = pickIncomingValue(node.id, graph, ctx);
    ctx[node.id] = passVal;
    return { ...base, status: "succeeded", output: passVal, durationMs: Date.now() - started };
  } catch (e) {
    return {
      ...base,
      status: "failed",
      error: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - started,
    };
  }
}

/**
 * 단일 노드만 실행(P3 디버깅/부분재개). ctx 는 호출부가 cachedOutputs+inputs 로 미리 구성해 넘긴다.
 * 대상 nodeId 가 없으면 throw(라우트가 404 로 매핑).
 */
export async function runSingleNode(
  graph: RunGraph,
  nodeId: string,
  ctx: Record<string, unknown>,
  inputs: Record<string, unknown>,
): Promise<NodeRun> {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`노드를 찾을 수 없습니다: "${nodeId}"`);
  return runNode(node, graph, inputs, ctx);
}

/**
 * 워크플로 전체 실행. 레이어 단위로 병렬 실행하며 onProgress 로 중간 상태를 흘려보낸다.
 * 의존 노드가 실패/스킵되면 해당 노드는 skipped 처리(downstream 차단).
 * cachedOutputs 가 있으면 해당 노드는 실행 생략하고 그 값을 ctx 에 주입(부분 재개·비용 절감).
 */
export async function runWorkflow(
  graph: RunGraph,
  inputs: Record<string, unknown>,
  onProgress?: (nodeRuns: NodeRun[]) => void,
  cachedOutputs?: Record<string, unknown>,
): Promise<WorkflowResult> {
  const layers = parallelLayers(graph); // 순환이면 여기서 throw
  const cache = cachedOutputs ?? {};
  // 캐시로 채워진(=실행 생략) 노드 id. 이 노드들은 skipped 지만 downstream 을 막지 않는다.
  const cachedIds = new Set<string>();

  const ctx: Record<string, unknown> = {};
  // 노드 순서 유지용. 초기 전부 pending.
  const runs = new Map<string, NodeRun>();
  for (const n of graph.nodes) runs.set(n.id, { nodeId: n.id, status: "pending" });
  const snapshot = (): NodeRun[] => graph.nodes.map((n) => runs.get(n.id)!);
  onProgress?.(snapshot());

  // target → sources (의존성) 매핑.
  const deps = new Map<string, string[]>(graph.nodes.map((n) => [n.id, []]));
  for (const e of graph.edges) {
    if (deps.has(e.target) && e.source !== e.target) deps.get(e.target)!.push(e.source);
  }

  // --- 조건 분기: 비선택 브랜치 엣지(인덱스) 차단 집합 + 도달가능성 계산 ---
  const indeg0 = new Map<string, number>(graph.nodes.map((n) => [n.id, 0]));
  for (const e of graph.edges) {
    if (indeg0.has(e.target) && e.source !== e.target) indeg0.set(e.target, (indeg0.get(e.target) ?? 0) + 1);
  }
  const entries = graph.nodes.map((n) => n.id).filter((id) => (indeg0.get(id) ?? 0) === 0);
  const blockedEdges = new Set<number>(); // condition 결과로 비선택된 분기 엣지 인덱스
  const prunedIds = new Set<string>(); // 분기 미선택으로 skip 된 노드(=실패전파와 구분)

  /** entries 에서 비차단 엣지만 따라 도달가능한 노드 집합. blockedEdges 반영. */
  const computeReachable = (): Set<string> => {
    const reach = new Set<string>(entries);
    const queue = [...entries];
    let h = 0;
    while (h < queue.length) {
      const id = queue[h++];
      graph.edges.forEach((e, idx) => {
        if (e.source === id && !blockedEdges.has(idx) && !reach.has(e.target)) {
          reach.add(e.target);
          queue.push(e.target);
        }
      });
    }
    return reach;
  };

  for (const layer of layers) {
    const reachable = computeReachable(); // 현재까지 결정된 분기 반영
    const toRun: RunGraphNode[] = [];
    for (const id of layer) {
      // 1) 캐시된 출력이 있으면 실행 생략하고 ctx 주입(skipped + note).
      if (Object.prototype.hasOwnProperty.call(cache, id) && cache[id] !== undefined) {
        ctx[id] = cache[id];
        cachedIds.add(id);
        runs.set(id, { nodeId: id, status: "skipped", output: cache[id], note: "캐시된 출력 재사용" });
        continue;
      }
      // 2) 조건 분기로 비선택된(=활성 경로로 도달 불가) 노드는 skip.
      if (!reachable.has(id)) {
        prunedIds.add(id);
        runs.set(id, { nodeId: id, status: "skipped", note: "조건 분기 미선택" });
        continue;
      }
      // 3) 선행 의존이 실패했으면 차단. (분기-skip/캐시 deps 는 차단하지 않음 — 머지 노드 보호)
      const deparr = deps.get(id) ?? [];
      const blocked = deparr.some((s) => {
        const st = runs.get(s)?.status;
        if (st === "failed") return true;
        return st === "skipped" && !cachedIds.has(s) && !prunedIds.has(s);
      });
      if (blocked) {
        runs.set(id, { nodeId: id, status: "skipped", error: "선행 노드 실패로 건너뜀" });
      } else {
        const node = graph.nodes.find((n) => n.id === id)!;
        runs.set(id, { nodeId: id, status: "running" });
        toRun.push(node);
      }
    }
    onProgress?.(snapshot());

    const results = await mapWithConcurrency(toRun, LAYER_CONCURRENCY, (node) =>
      runNode(node, graph, inputs, ctx),
    );
    for (const r of results) runs.set(r.nodeId, r);

    // condition 노드가 성공했으면 비선택 분기 엣지를 차단(다음 레이어 도달성에 반영).
    for (const r of results) {
      if (r.status !== "succeeded") continue;
      const node = graph.nodes.find((n) => n.id === r.nodeId);
      if (node?.nodeRole !== "condition") continue;
      const selected = ctx[r.nodeId] === true ? "true" : "false";
      graph.edges.forEach((e, idx) => {
        if (e.source === r.nodeId && e.conditionBranch && e.conditionBranch !== selected) {
          blockedEdges.add(idx);
        }
      });
    }
    onProgress?.(snapshot());
  }

  const nodeRuns = snapshot();
  const totalTokens = nodeRuns.reduce((sum, r) => sum + (r.tokensIn ?? 0) + (r.tokensOut ?? 0), 0);

  // finalOutput: output 노드 우선, 없으면 위상순서상 마지막으로 성공한 노드의 출력.
  const outputNode = graph.nodes.find((n) => n.nodeRole === "output");
  let finalOutput: unknown;
  if (outputNode) {
    finalOutput = ctx[outputNode.id];
  } else {
    const order = topoSort(graph);
    for (let i = order.length - 1; i >= 0; i--) {
      const r = runs.get(order[i]);
      // 성공 노드 또는 캐시 재사용(skipped+값) 노드의 출력을 최종으로.
      if (r && (r.status === "succeeded" || cachedIds.has(order[i]))) {
        finalOutput = r.output;
        break;
      }
    }
  }

  return { nodeRuns, finalOutput, totalTokens: totalTokens || undefined };
}

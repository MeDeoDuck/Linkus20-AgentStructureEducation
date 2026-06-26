/**
 * 실행 라우트.
 *   POST /api/run        { graph, inputs, cachedOutputs? } → { runId } 즉시 반환, 백그라운드 실행.
 *   POST /api/run/node   { graph, inputs, cachedOutputs?, nodeId } → 단일 노드 동기 실행 → { nodeRun }.
 *   GET  /api/run/:runId → Run 전체(nodeRuns 포함).
 *
 * 백그라운드 실행 중 store 를 단계별 갱신 → 프론트는 GET 폴링으로 진행상황을 본다.
 */
import { Router, type Request, type Response } from "express";
import { runWorkflow, runSingleNode, type RunGraph } from "../lib/runEngine.js";
import { runStore } from "../lib/runStore.js";
import { GitHubModelsError } from "../lib/copilot.js";
import { makeRateLimiter } from "../util/rateLimit.js";
import { safeLog } from "../util/logRedact.js";

export const runRouter = Router();

// 간이 레이트리밋(공용). POST(실행 시작/단일 실행)에만 적용 — GET 폴링은 제외(빈번해서 막으면 안 됨).
// 배치 고려해 tool 보다 약간 높게(동시 4·분당 40). 백그라운드 실행이라 분당 한도가 실질 보호선.
const runLimiter = makeRateLimiter({ concurrent: 4, perMinute: 40 });

const MAX_NODES = 60;
const MAX_LLM = 20;

interface RunBody {
  graph?: { nodes?: unknown; edges?: unknown };
  inputs?: Record<string, unknown>;
  /** 이전 Run 의 성공 출력(부분 재개·단일 실행 시 앞 노드 출력 재사용). */
  cachedOutputs?: Record<string, unknown>;
  /** 단일 노드 실행 대상(POST /node 전용). */
  nodeId?: string;
}

/** 노드/LLM 상한 검사. 통과면 null, 위반이면 사용자 메시지 반환. */
function checkLimits(graph: RunGraph): string | null {
  if (graph.nodes.length > MAX_NODES) return `노드는 최대 ${MAX_NODES}개까지 실행할 수 있습니다.`;
  if (graph.nodes.filter((n) => n.nodeRole === "llm").length > MAX_LLM) return `LLM 노드는 최대 ${MAX_LLM}개입니다.`;
  return null;
}

/** cachedOutputs 를 안전한 평범한 객체로 정규화(없으면 undefined). */
function sanitizeCached(raw: unknown): Record<string, unknown> | undefined {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
}

/** body.graph 를 안전하게 RunGraph 로 정규화(필수: nodes 배열). */
function normalizeGraph(raw: RunBody["graph"]): RunGraph {
  const nodes = Array.isArray(raw?.nodes) ? raw!.nodes : [];
  const edges = Array.isArray(raw?.edges) ? raw!.edges : [];
  const seen = new Set<string>();
  const safeNodes = nodes
    .filter((n): n is Record<string, unknown> => !!n && typeof n === "object")
    .filter((n) => typeof n.id === "string" && n.id)
    // 중복 id 는 첫 항목만 유지(위상정렬 어긋남 방지).
    .filter((n) => {
      const id = n.id as string;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((n) => ({
      id: n.id as string,
      nodeRole: typeof n.nodeRole === "string" ? (n.nodeRole as string) : undefined,
      config: n.config && typeof n.config === "object" ? (n.config as Record<string, unknown>) : undefined,
      prompt: typeof n.prompt === "string" ? (n.prompt as string) : undefined,
    }));
  const safeEdges = edges
    .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
    .filter((e) => typeof e.source === "string" && typeof e.target === "string")
    .map((e) => ({
      source: e.source as string,
      target: e.target as string,
      // 조건 분기 라벨 보존(유효값만). 없으면 생략(하위호환).
      conditionBranch:
        e.conditionBranch === "true" || e.conditionBranch === "false"
          ? (e.conditionBranch as "true" | "false")
          : undefined,
    }));
  return { nodes: safeNodes, edges: safeEdges };
}

runRouter.post("/", runLimiter, (req: Request, res: Response) => {
  const body = (req.body ?? {}) as RunBody;
  const graph = normalizeGraph(body.graph);
  const inputs = body.inputs && typeof body.inputs === "object" ? body.inputs : {};
  const cachedOutputs = sanitizeCached(body.cachedOutputs);

  if (graph.nodes.length === 0) {
    res.status(400).json({ error: "bad_request", message: "실행할 노드가 없습니다." });
    return;
  }
  // 비용 폭증·DoS 방어: 익명 호출이 운영자 키로 대량 LLM 호출하는 것을 상한으로 차단.
  const limitErr = checkLimits(graph);
  if (limitErr) {
    res.status(400).json({ error: "too_large", message: limitErr });
    return;
  }

  const run = runStore.createRun(inputs);

  // 백그라운드 실행 — 응답은 즉시 runId 만 반환(클라이언트는 GET 폴링).
  void (async () => {
    runStore.updateRun(run.runId, { status: "running" });
    try {
      const result = await runWorkflow(
        graph,
        inputs,
        (nodeRuns) => {
          runStore.updateRun(run.runId, { nodeRuns });
        },
        cachedOutputs,
      );
      const failed = result.nodeRuns.some((r) => r.status === "failed");
      runStore.updateRun(run.runId, {
        status: failed ? "failed" : "succeeded",
        nodeRuns: result.nodeRuns,
        finalOutput: result.finalOutput,
        totalTokens: result.totalTokens,
        finishedAt: Date.now(),
      });
    } catch (e) {
      // 순환 등 그래프 자체 오류.
      safeLog("[run] workflow error:", String(e));
      runStore.updateRun(run.runId, {
        status: "failed",
        error: e instanceof Error ? e.message : "실행 중 오류가 발생했습니다.",
        finishedAt: Date.now(),
      });
    }
  })();

  res.status(202).json({ runId: run.runId });
});

/** 단일 노드 동기 실행. cachedOutputs+inputs 로 ctx 를 구성해 대상 노드 1개만 돌린다. */
runRouter.post("/node", runLimiter, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as RunBody;
  const graph = normalizeGraph(body.graph);
  const inputs = body.inputs && typeof body.inputs === "object" ? body.inputs : {};
  const cachedOutputs = sanitizeCached(body.cachedOutputs) ?? {};
  const nodeId = typeof body.nodeId === "string" ? body.nodeId : "";

  if (graph.nodes.length === 0) {
    res.status(400).json({ error: "bad_request", message: "실행할 노드가 없습니다." });
    return;
  }
  const limitErr = checkLimits(graph);
  if (limitErr) {
    res.status(400).json({ error: "too_large", message: limitErr });
    return;
  }
  if (!nodeId || !graph.nodes.some((n) => n.id === nodeId)) {
    res.status(404).json({ error: "not_found", message: "대상 노드를 찾을 수 없습니다." });
    return;
  }

  try {
    // ctx = 캐시된 앞 노드 출력(있는 값만 주입) — bindVars 가 {{앞노드}} 를 해소.
    const ctx: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(cachedOutputs)) if (v !== undefined) ctx[k] = v;
    const nodeRun = await runSingleNode(graph, nodeId, ctx, inputs);
    res.json({ nodeRun });
  } catch (e) {
    safeLog("[run] single-node error:", String(e));
    const status = e instanceof GitHubModelsError && e.status >= 400 && e.status < 600 ? e.status : 500;
    const message = e instanceof Error ? e.message : "노드 실행 중 오류가 발생했습니다.";
    res.status(status).json({ error: "run_error", message });
  }
});

runRouter.get("/:runId", (req: Request, res: Response) => {
  const run = runStore.getRun(req.params.runId);
  if (!run) {
    res.status(404).json({ error: "not_found", message: "해당 실행을 찾을 수 없습니다." });
    return;
  }
  res.json(run);
});

// 라우터 수준 안전망(예상 못한 동기 오류).
runRouter.use((err: unknown, _req: Request, res: Response, _next: (e?: unknown) => void) => {
  safeLog("[run] route error:", String(err));
  const status = err instanceof GitHubModelsError && err.status >= 400 && err.status < 600 ? err.status : 500;
  const message = err instanceof Error ? err.message : "실행 처리 중 오류가 발생했습니다.";
  res.status(status).json({ error: "run_error", message });
});

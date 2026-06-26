/**
 * 실행 엔진 백엔드 호출 래퍼. (src/api/copilotApi.ts 패턴 따름)
 *   POST /api/run        { graph, inputs } → { runId }
 *   GET  /api/run/:runId → Run 전체
 * API 키는 서버에만 존재 — 프론트는 graph/inputs 만 보낸다.
 */
import type { DiagramGraph } from "../ai/types";
import type { NodeRun, Run } from "../store/useRunStore";

/** 백엔드 베이스 URL. same-origin 배포면 비워둠. 분리 배포면 VITE_API_BASE 지정. */
const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

export async function postRun(graph: DiagramGraph, inputs: Record<string, unknown>): Promise<{ runId: string }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graph, inputs }),
    });
  } catch {
    throw new Error("백엔드에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요.");
  }
  const data = (await res.json().catch(() => null)) as { runId?: string; message?: string } | null;
  if (!res.ok || !data?.runId) {
    throw new Error(data?.message ?? "실행 요청에 실패했습니다.");
  }
  return { runId: data.runId };
}

/**
 * 단일 노드 실행(부분재개·디버깅). cachedOutputs(이전 Run 성공 출력)로 앞 노드 출력을 재사용한다.
 */
export async function postRunNode(
  graph: DiagramGraph,
  inputs: Record<string, unknown>,
  cachedOutputs: Record<string, unknown>,
  nodeId: string,
): Promise<NodeRun> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/run/node`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ graph, inputs, cachedOutputs, nodeId }),
    });
  } catch {
    throw new Error("백엔드에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요.");
  }
  const data = (await res.json().catch(() => null)) as { nodeRun?: NodeRun; message?: string } | null;
  if (!res.ok || !data?.nodeRun) {
    throw new Error(data?.message ?? "노드 실행에 실패했습니다.");
  }
  return data.nodeRun;
}

export async function getRun(runId: string): Promise<Run> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/run/${encodeURIComponent(runId)}`, { method: "GET" });
  } catch {
    throw new Error("백엔드에 연결할 수 없습니다.");
  }
  const data = (await res.json().catch(() => null)) as (Run & { message?: string }) | null;
  if (!res.ok || !data || typeof data.runId !== "string") {
    throw new Error(data?.message ?? "실행 상태 조회에 실패했습니다.");
  }
  return data;
}

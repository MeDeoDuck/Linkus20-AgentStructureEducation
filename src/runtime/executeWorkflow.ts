/**
 * 현재 캔버스(useDiagramStore)를 실행 그래프로 만들어 백엔드 실행엔진에 보내고,
 * 완료까지 폴링하며 진행 상태를 콜백으로 흘려보낸다.
 *
 * 그래프는 toGraph(blocks, arrows)로 구성한다 — P1에서 toGraph 가 nodeRole/config/prompt 를
 * AINode 로 흘려보내므로(edges 는 edgeKind/conditionBranch 포함), 별도 직렬화 없이 그대로 전송한다.
 */
import { toGraph } from "../ai/diagramBridge";
import { useDiagramStore } from "../store/useDiagramStore";
import { postRun, getRun, postRunNode } from "../api/runApi";
import type { NodeRun, Run } from "../store/useRunStore";

const POLL_INTERVAL_MS = 600;
const TIMEOUT_MS = 120_000; // 2분

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isTerminal = (s: Run["status"]) => s === "succeeded" || s === "failed" || s === "canceled";

/**
 * @param inputs    input 노드 id → 사용자 입력값
 * @param onUpdate  폴링으로 받은 Run 스냅샷마다 호출(UI 갱신)
 * @returns         종료된 최종 Run
 */
export async function executeWorkflow(
  inputs: Record<string, unknown>,
  onUpdate: (run: Run) => void,
): Promise<Run> {
  const d = useDiagramStore.getState();
  const graph = toGraph(d.blocks, d.arrows); // nodeRole/config/prompt 포함(P1)

  const { runId } = await postRun(graph, inputs);

  const start = Date.now();
  // 처음 한 번은 즉시 조회.
  while (Date.now() - start < TIMEOUT_MS) {
    const run = await getRun(runId);
    onUpdate(run);
    if (isTerminal(run.status)) return run;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error("실행 시간이 초과되었습니다. (타임아웃)");
}

/**
 * 단일 노드만 동기 실행(부분재개·디버깅). 현재 캔버스로 그래프를 구성하고
 * cachedOutputs(앞 노드 출력)를 함께 보내 그 노드 1개의 NodeRun 을 받아온다.
 */
export async function executeSingleNode(
  nodeId: string,
  inputs: Record<string, unknown>,
  cachedOutputs: Record<string, unknown>,
): Promise<NodeRun> {
  const d = useDiagramStore.getState();
  const graph = toGraph(d.blocks, d.arrows); // nodeRole/config/prompt 포함(P1)
  return postRunNode(graph, inputs, cachedOutputs, nodeId);
}

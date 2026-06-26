/**
 * 배치 실행: 동일 워크플로우를 여러 입력 케이스로 일괄 실행한다.
 * 각 케이스는 기존 executeWorkflow(POST /api/run + 폴링)를 그대로 재사용 → 서버는 케이스마다
 * 독립 runId 를 만든다(상태/토큰 분리). 소동시(기본 3)로 서버 부담을 제한.
 */
import { executeWorkflow } from "./executeWorkflow";
import type { Run } from "../store/useRunStore";

const DEFAULT_CONCURRENCY = 3;

/** 실패한 케이스도 Run 형태로 만들어 비교 테이블에서 누락되지 않게 한다. */
function failedRun(inputs: Record<string, unknown>, msg: string): Run {
  return {
    runId: "",
    status: "failed",
    inputs,
    nodeRuns: [],
    startedAt: Date.now(),
    finishedAt: Date.now(),
    error: msg,
  };
}

/**
 * @param casesInputs  케이스별 입력(노드 id → 값) 배열
 * @param onCaseUpdate 각 케이스의 Run 스냅샷이 갱신될 때마다 호출(index, run)
 * @param concurrency  동시 실행 케이스 수(기본 3)
 * @returns            케이스 순서대로의 최종 Run 배열
 */
export async function executeBatch(
  casesInputs: Array<Record<string, unknown>>,
  onCaseUpdate: (index: number, run: Run) => void,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<Run[]> {
  const results = new Array<Run>(casesInputs.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < casesInputs.length) {
      const i = cursor++;
      const inputs = casesInputs[i];
      try {
        const run = await executeWorkflow(inputs, (r) => onCaseUpdate(i, r));
        results[i] = run;
        onCaseUpdate(i, run);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "실행 중 오류가 발생했습니다.";
        const fr = failedRun(inputs, msg);
        results[i] = fr;
        onCaseUpdate(i, fr);
      }
    }
  };

  const pool = Array.from({ length: Math.min(concurrency, casesInputs.length) || 0 }, () => worker());
  await Promise.all(pool);
  return results;
}

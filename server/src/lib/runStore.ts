/**
 * 실행(Run) 상태 저장소. MVP는 in-memory(Map). 프로세스 재시작 시 휘발 — 의도된 단순화.
 * (영속화가 필요하면 RunStore 인터페이스를 다른 구현으로 교체.)
 */
import { randomUUID } from "node:crypto";
import type { NodeRun } from "./runEngine.js";

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface Run {
  runId: string;
  status: RunStatus;
  inputs: Record<string, unknown>;
  nodeRuns: NodeRun[];
  finalOutput?: unknown;
  totalTokens?: number;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

export interface RunStore {
  createRun(inputs: Record<string, unknown>): Run;
  getRun(runId: string): Run | undefined;
  updateRun(runId: string, patch: Partial<Omit<Run, "runId">>): Run | undefined;
}

/** 추측 불가 runId(IDOR 열거 차단). seq 카운터 폐기. */
function newRunId(): string {
  return `run-${randomUUID()}`;
}

/** in-memory 보관 상한(무한증가 방지). 초과 시 가장 오래된 항목부터 evict. */
const MAX_RUNS = 200;

export class MemoryRunStore implements RunStore {
  private runs = new Map<string, Run>();

  createRun(inputs: Record<string, unknown>): Run {
    // 상한 초과 시 가장 오래된(삽입순 첫) 항목 제거.
    if (this.runs.size > MAX_RUNS) {
      const oldest = this.runs.keys().next().value;
      if (oldest) this.runs.delete(oldest);
    }
    const run: Run = {
      runId: newRunId(),
      status: "queued",
      inputs,
      nodeRuns: [],
      startedAt: Date.now(),
    };
    this.runs.set(run.runId, run);
    return run;
  }

  getRun(runId: string): Run | undefined {
    return this.runs.get(runId);
  }

  updateRun(runId: string, patch: Partial<Omit<Run, "runId">>): Run | undefined {
    const cur = this.runs.get(runId);
    if (!cur) return undefined;
    const next = { ...cur, ...patch };
    this.runs.set(runId, next);
    return next;
  }
}

/** 앱 전역 단일 인스턴스(라우트에서 공유). */
export const runStore: RunStore = new MemoryRunStore();

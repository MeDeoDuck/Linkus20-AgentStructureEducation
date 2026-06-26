/**
 * 워크플로 실행(run) 전용 상태. 다이어그램 store(빌드/undo·redo)와 완전히 분리.
 * 실행은 그래프를 변형하지 않으며, 결과는 in-memory(새로고침 시 휘발).
 */
import { create } from "zustand";
import { executeWorkflow, executeSingleNode } from "../runtime/executeWorkflow";
import { executeBatch } from "../runtime/executeBatch";

const HISTORY_LIMIT = 50;

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
  /** 비차단 안내(미해결 변수참조 경고, 캐시 재사용 표식 등). 서버 NodeRun.note 와 일치. */
  note?: string;
}

export interface Run {
  runId: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  inputs: Record<string, unknown>;
  nodeRuns: NodeRun[];
  finalOutput?: unknown;
  totalTokens?: number;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

/** 배치 실행 상태: 여러 입력 케이스의 Run 묶음. */
export interface BatchState {
  cases: Run[];
  running: boolean;
}

interface RunState {
  current: Run | null;
  history: Run[];
  batch: BatchState | null;
  status: "idle" | "running";
  error: string | null;
  /** RunPanel 표시 여부(UI). */
  panelOpen: boolean;

  startRun: (inputs: Record<string, unknown>) => Promise<void>;
  /** 동일 워크플로우를 여러 입력 케이스로 일괄 실행. */
  startBatch: (casesInputs: Array<Record<string, unknown>>) => Promise<void>;
  /** 단일 노드만 다시 실행(직전 Run의 성공 출력을 cachedOutputs로 재사용). */
  runSingleNode: (nodeId: string) => Promise<void>;
  /** current.nodeRuns 중 한 노드만 부분 갱신. */
  updateNodeRun: (nodeId: string, patch: Partial<NodeRun>) => void;
  /** 히스토리/배치의 Run 을 상세 보기로 current 에 올림. */
  viewRun: (run: Run) => void;
  reset: () => void;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
}

/** 배치당 케이스 수 상한(서버 부담 보호). */
export const MAX_BATCH_CASES = 20;

export const useRunStore = create<RunState>((set, get) => ({
  current: null,
  history: [],
  batch: null,
  status: "idle",
  error: null,
  panelOpen: false,

  startRun: async (inputs) => {
    if (get().status === "running") return;
    set({
      status: "running",
      error: null,
      current: { runId: "", status: "queued", inputs, nodeRuns: [], startedAt: Date.now() },
    });
    try {
      const final = await executeWorkflow(inputs, (run) => set({ current: run }));
      set((s) => ({
        status: "idle",
        current: final,
        history: [final, ...s.history].slice(0, HISTORY_LIMIT),
        error: final.status === "failed" ? final.error ?? "일부 노드 실행에 실패했습니다." : null,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "실행 중 오류가 발생했습니다.";
      set((s) => ({
        status: "idle",
        error: msg,
        current: s.current ? { ...s.current, status: "failed", error: msg } : null,
      }));
    }
  },

  startBatch: async (casesInputs) => {
    if (get().status === "running") return;
    const cases = casesInputs.slice(0, MAX_BATCH_CASES);
    if (cases.length === 0) {
      set({ error: "실행할 케이스가 없습니다." });
      return;
    }
    const placeholders: Run[] = cases.map((inp) => ({
      runId: "",
      status: "queued",
      inputs: inp,
      nodeRuns: [],
      startedAt: Date.now(),
    }));
    set({ status: "running", error: null, batch: { cases: placeholders, running: true } });
    try {
      const runs = await executeBatch(cases, (i, run) => {
        set((s) => {
          if (!s.batch) return s;
          const next = s.batch.cases.slice();
          next[i] = run;
          return { batch: { cases: next, running: true } };
        });
      });
      set((s) => ({
        status: "idle",
        batch: { cases: runs, running: false },
        // 배치의 각 케이스도 히스토리에 누적(최근이 앞으로).
        history: [...runs.slice().reverse(), ...s.history].slice(0, HISTORY_LIMIT),
        error: runs.some((r) => r.status === "failed") ? "일부 케이스가 실패했습니다." : null,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "배치 실행 중 오류가 발생했습니다.";
      set((s) => ({ status: "idle", error: msg, batch: s.batch ? { ...s.batch, running: false } : null }));
    }
  },

  updateNodeRun: (nodeId, patch) =>
    set((s) => {
      if (!s.current) return s;
      return {
        current: {
          ...s.current,
          nodeRuns: s.current.nodeRuns.map((nr) => (nr.nodeId === nodeId ? { ...nr, ...patch } : nr)),
        },
      };
    }),

  runSingleNode: async (nodeId) => {
    const cur = get().current;
    if (!cur || cur.nodeRuns.length === 0) {
      set({ error: "먼저 전체 실행이 필요합니다." });
      return;
    }
    if (get().status === "running") return;
    // 직전 Run의 성공/캐시 출력(자기 자신 제외)을 cachedOutputs로 재사용.
    const cachedOutputs: Record<string, unknown> = {};
    for (const nr of cur.nodeRuns) {
      if (nr.nodeId === nodeId) continue;
      if ((nr.status === "succeeded" || nr.status === "skipped") && nr.output !== undefined) {
        cachedOutputs[nr.nodeId] = nr.output;
      }
    }
    get().updateNodeRun(nodeId, { status: "running", error: undefined });
    set({ error: null });
    try {
      const nodeRun = await executeSingleNode(nodeId, cur.inputs, cachedOutputs);
      get().updateNodeRun(nodeId, nodeRun);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "노드 실행 중 오류가 발생했습니다.";
      get().updateNodeRun(nodeId, { status: "failed", error: msg });
      set({ error: msg });
    }
  },

  viewRun: (run) => set({ current: run }),

  reset: () => set({ current: null, error: null, status: "idle", batch: null }),
  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
}));

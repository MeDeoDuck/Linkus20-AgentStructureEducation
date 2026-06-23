/**
 * AI Assistant 패널 전용 상태(다이어그램 store 와 분리). GitHub Copilot 단일 경로.
 * 흐름: setInput → run()(provider 호출, 응답을 pending 으로 보관·미반영)
 *      → applyPending()(검증 후 캔버스 반영) 또는 cancelPending().
 */
import { create } from "zustand";
import { EXTERNAL_NODE_TYPES, blockToNode, toGraph, validateOperations } from "../ai/diagramBridge";
import { getProvider } from "../ai/providers";
import type { ChatMessage, DiagramAIRequest, Operation } from "../ai/types";
import { useDiagramStore } from "./useDiagramStore";

interface PendingProposal {
  messageId: string;
  message: string;
  operations: Operation[];
  errors: string[];
  warnings: string[];
}

interface AIState {
  collapsed: boolean;
  input: string;
  status: "idle" | "loading";
  error: string | null;
  messages: ChatMessage[];
  pending: PendingProposal | null;

  toggleCollapsed: () => void;
  setInput: (v: string) => void;
  run: () => Promise<void>;
  applyPending: () => void;
  cancelPending: () => void;
  clearChat: () => void;
}

let msgSeq = 0;
const msgId = () => `m-${Date.now().toString(36)}-${(msgSeq++).toString(36)}`;

/** 현재 캔버스에서 AI 요청 payload 를 구성. */
function buildRequest(prompt: string): DiagramAIRequest {
  const d = useDiagramStore.getState();
  const graph = toGraph(d.blocks, d.arrows);
  const selectedBlockIds = d.selection.filter((r) => r.type === "block").map((r) => r.id);
  const selectedNodes = d.blocks.filter((b) => selectedBlockIds.includes(b.id)).map(blockToNode);
  return {
    prompt,
    diagram: graph,
    availableNodeTypes: [...EXTERNAL_NODE_TYPES],
    selectedNodes,
    selectedNodeId: selectedBlockIds[0] ?? null,
  };
}

export const useAIStore = create<AIState>((set, get) => ({
  collapsed: false,
  input: "",
  status: "idle",
  error: null,
  messages: [],
  pending: null,

  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
  setInput: (input) => set({ input }),

  run: async () => {
    const { input, status } = get();
    const prompt = input.trim();
    if (!prompt || status === "loading") return;

    const userMsg: ChatMessage = { id: msgId(), role: "user", text: prompt };
    set((s) => ({ messages: [...s.messages, userMsg], input: "", status: "loading", error: null, pending: null }));

    try {
      const res = await getProvider().generateDiagramEdit(buildRequest(prompt));
      // 응답 시점의 그래프로 검증(존재하지 않는 id 참조 차단).
      const graph = toGraph(useDiagramStore.getState().blocks, useDiagramStore.getState().arrows);
      const { errors, warnings } = validateOperations(res.operations, graph);

      const aiMsg: ChatMessage = {
        id: msgId(),
        role: "assistant",
        text: res.message,
        operations: res.operations.length ? res.operations : undefined,
      };
      set((s) => ({
        messages: [...s.messages, aiMsg],
        status: "idle",
        pending: res.operations.length
          ? { messageId: aiMsg.id, message: res.message, operations: res.operations, errors, warnings }
          : null,
      }));
    } catch (e) {
      const text = e instanceof Error ? e.message : "AI 호출 중 오류가 발생했습니다.";
      set((s) => ({
        status: "idle",
        error: text,
        messages: [...s.messages, { id: msgId(), role: "system", text: `⚠️ ${text}` }],
      }));
    }
  },

  applyPending: () => {
    const { pending } = get();
    if (!pending) return;
    if (pending.errors.length) {
      set({ error: pending.errors.join("\n") });
      return;
    }
    // 적용 직전 현재 캔버스로 재검증(미리보기 후 사용자가 수동 편집해 id 가 사라졌을 수 있음).
    const d = useDiagramStore.getState();
    const { errors } = validateOperations(pending.operations, toGraph(d.blocks, d.arrows));
    if (errors.length) {
      set({ error: "캔버스가 변경되어 제안을 적용할 수 없습니다:\n" + errors.join("\n") });
      return;
    }
    useDiagramStore.getState().applyAIOperations(pending.operations);
    set((s) => ({
      pending: null,
      error: null,
      messages: s.messages.map((m) => (m.id === pending.messageId ? { ...m, applied: true } : m)),
    }));
  },

  cancelPending: () => set({ pending: null, error: null }),

  clearChat: () => set({ messages: [], pending: null, error: null }),
}));

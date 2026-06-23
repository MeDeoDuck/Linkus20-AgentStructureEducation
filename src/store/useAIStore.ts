/**
 * AI Assistant 패널 전용 상태(다이어그램 store 와 분리).
 * 흐름: setInput → run()(provider 호출, 응답을 pending 으로 보관·미반영)
 *      → applyPending()(검증 후 캔버스 반영) 또는 cancelPending().
 */
import { create } from "zustand";
import { AVAILABLE_NODE_TYPES, blockToNode, toGraph, validateOperations } from "../ai/diagramBridge";
import { getProvider } from "../ai/providers";
import type { AIModelId, ChatMessage, DiagramAIRequest, Operation } from "../ai/types";
import { useDiagramStore } from "./useDiagramStore";

interface PendingProposal {
  /** 이 제안을 담은 assistant 메시지 id(적용 표시를 정확히 그 메시지에만 붙이기 위함). */
  messageId: string;
  message: string;
  operations: Operation[];
  errors: string[];
  warnings: string[];
}

interface AIState {
  collapsed: boolean;
  model: AIModelId;
  input: string;
  status: "idle" | "loading";
  error: string | null;
  messages: ChatMessage[];
  /** 적용 대기 중인 AI 제안(미리보기). null 이면 없음. */
  pending: PendingProposal | null;

  toggleCollapsed: () => void;
  setModel: (model: AIModelId) => void;
  setInput: (v: string) => void;
  run: () => Promise<void>;
  applyPending: () => void;
  cancelPending: () => void;
  clearChat: () => void;
}

let msgSeq = 0;
const msgId = () => `m-${Date.now().toString(36)}-${(msgSeq++).toString(36)}`;

/** 현재 캔버스에서 AI 요청 payload 를 구성. */
function buildRequest(prompt: string, model: AIModelId): DiagramAIRequest {
  const d = useDiagramStore.getState();
  const graph = toGraph(d.blocks, d.arrows);
  const selectedBlockIds = new Set(d.selection.filter((r) => r.type === "block").map((r) => r.id));
  const selectedNodes = d.blocks.filter((b) => selectedBlockIds.has(b.id)).map(blockToNode);
  return { prompt, diagram: graph, availableNodeTypes: AVAILABLE_NODE_TYPES, selectedNodes, model };
}

export const useAIStore = create<AIState>((set, get) => ({
  collapsed: false,
  model: "claude",
  input: "",
  status: "idle",
  error: null,
  messages: [],
  pending: null,

  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
  setModel: (model) => set({ model }),
  setInput: (input) => set({ input }),

  run: async () => {
    const { input, model, status } = get();
    const prompt = input.trim();
    if (!prompt || status === "loading") return;

    const userMsg: ChatMessage = { id: msgId(), role: "user", text: prompt };
    set((s) => ({ messages: [...s.messages, userMsg], input: "", status: "loading", error: null, pending: null }));

    try {
      const req = buildRequest(prompt, model);
      const res = await getProvider(model).generateDiagramEdit(req);
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

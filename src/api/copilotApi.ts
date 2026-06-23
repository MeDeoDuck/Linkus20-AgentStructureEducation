/**
 * 백엔드 AI 호출 래퍼. /api/ai/copilot 로 자연어 요청 + 현재 다이어그램을 보내고
 * { message, operations } 를 받는다. (로그인/쿠키 불필요 — 운영자 키로 백엔드가 GPT 호출)
 */
import { serializeGraph } from "../ai/diagramBridge";
import type { DiagramAIRequest, DiagramAIResponse } from "../ai/types";

/** 백엔드 베이스 URL. same-origin 배포면 비워둠. 분리 배포면 VITE_API_BASE 지정. */
const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

export async function callCopilot(req: DiagramAIRequest): Promise<DiagramAIResponse> {
  const payload = {
    prompt: req.prompt,
    diagram: serializeGraph(req.diagram), // 외부 표기(rounded-rectangle)로 전송
    availableNodeTypes: req.availableNodeTypes,
    selectedNodeId: req.selectedNodeId,
    selectedNodes: req.selectedNodes,
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/ai/copilot`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("백엔드에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요.");
  }

  const data = (await res.json().catch(() => null)) as DiagramAIResponse | null;
  // 백엔드가 status 별 안전 메시지를 message 로 내려준다.
  if (!res.ok) {
    throw new Error(data?.message ?? "AI 요청 처리 중 오류가 발생했습니다.");
  }
  if (!data || typeof data.message !== "string" || !Array.isArray(data.operations)) {
    throw new Error("AI 응답 형식이 올바르지 않습니다.");
  }
  return data;
}

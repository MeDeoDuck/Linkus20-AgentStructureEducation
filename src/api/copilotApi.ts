/**
 * 백엔드 Copilot 호출 래퍼. /api/ai/copilot 로 자연어 요청 + 현재 다이어그램을 보내고
 * { message, operations } 를 받는다. GitHub 토큰/SDK 호출은 전부 백엔드에서.
 */
import { API_BASE } from "./authApi";
import { serializeGraph } from "../ai/diagramBridge";
import type { DiagramAIRequest, DiagramAIResponse } from "../ai/types";

/** 세션 쿠키로 인증된 Copilot 호출. 비로그인/권한없음/실패는 상태코드별 에러 메시지로. */
export async function callCopilot(req: DiagramAIRequest): Promise<DiagramAIResponse> {
  const payload = {
    prompt: req.prompt,
    diagram: serializeGraph(req.diagram), // 외부 표기(rounded-rectangle)로 전송
    availableNodeTypes: req.availableNodeTypes,
    selectedNodeId: req.selectedNodeId,
    selectedNodes: req.selectedNodes, // 백엔드 호환(선택 블록 상세)
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/ai/copilot`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("백엔드에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요.");
  }

  if (res.status === 401) throw new Error("로그인이 필요합니다. GitHub로 로그인해 주세요.");
  if (res.status === 403)
    throw new Error("현재 GitHub 계정에서 Copilot 사용 권한을 확인할 수 없습니다. Copilot 구독 또는 학생 인증 상태를 확인해 주세요.");
  if (!res.ok) throw new Error("AI 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");

  const data = (await res.json()) as DiagramAIResponse;
  if (!data || typeof data.message !== "string" || !Array.isArray(data.operations)) {
    throw new Error("AI 응답 형식이 올바르지 않습니다.");
  }
  return data;
}

/**
 * AI 라우트.
 *   POST /api/ai/copilot — requireAuth. 세션 토큰으로 Copilot 호출 → {message, operations} 반환.
 *
 * body(프론트 backendProvider.ts 가 보내는 형태):
 *   { system, prompt, diagram, availableNodeTypes, selectedNodes, model }
 * 스펙 호환을 위해 selectedNodeId 단일 값도 함께 허용한다.
 */
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { callCopilot } from "../lib/copilot.js";
import { safeLog } from "../util/logRedact.js";

export const aiRouter = Router();

interface CopilotBody {
  system?: string;
  prompt?: string;
  diagram?: unknown;
  availableNodeTypes?: string[];
  selectedNodes?: unknown;
  selectedNodeId?: string | null;
  model?: string;
}

aiRouter.post("/copilot", requireAuth, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as CopilotBody;

  // 입력 검증.
  if (typeof body.prompt !== "string" || body.prompt.trim() === "") {
    res.status(400).json({ error: "bad_request", message: "prompt 가 필요합니다." });
    return;
  }

  const availableNodeTypes =
    Array.isArray(body.availableNodeTypes) && body.availableNodeTypes.length > 0
      ? body.availableNodeTypes
      : ["user", "rectangle", "diamond", "rounded-rectangle"];

  // requireAuth 통과 → githubToken 존재 보장. (타입 안전 위해 재확인)
  const githubToken = req.session.githubToken;
  if (!githubToken) {
    res.status(401).json({ error: "unauthorized", message: "GitHub 로그인이 필요합니다." });
    return;
  }

  try {
    const result = await callCopilot({
      githubToken,
      system: body.system,
      prompt: body.prompt,
      diagram: body.diagram ?? { nodes: [], edges: [] },
      availableNodeTypes,
      selectedNodes: body.selectedNodes,
      selectedNodeId: body.selectedNodeId ?? null,
      // NOTE: 프론트 model 값("copilot"/"gpt"…)은 UI 라우팅용 식별자이지 SDK 모델명이 아니다.
      //   그대로 createSession({model}) 에 넣으면 잘못된 모델명으로 실패하므로 전달하지 않는다.
      //   → SDK 기본 모델 사용. TODO: 공식 문서 확인 필요 — 매핑 테이블 작성 후 명시적 지정.
    });

    // {message, operations} 형태로만 반환(토큰/내부정보 0).
    res.json({ message: result.message, operations: result.operations });
  } catch (err) {
    // callCopilot 은 이미 안전 메시지로 일반화해 throw 한다.
    safeLog("[ai] copilot route error:", String(err));
    const message = err instanceof Error ? err.message : "AI 처리 중 오류가 발생했습니다.";
    res.status(502).json({ error: "ai_error", message });
  }
});

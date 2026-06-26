/**
 * AI 라우트.
 *   POST /api/ai/copilot — OpenAI GPT API 호출 → {message, operations} 반환.
 *   (경로명은 프론트 호환을 위해 /copilot 유지. 인증 불필요 — 로그인 없이 사용.)
 *
 * body: { system?, prompt, diagram, availableNodeTypes, selectedNodes?, selectedNodeId? }
 */
import { Router, type Request, type Response } from "express";
import { callCopilot, GitHubModelsError } from "../lib/copilot.js";
import { makeRateLimiter } from "../util/rateLimit.js";
import { safeLog } from "../util/logRedact.js";

export const aiRouter = Router();

// 간이 레이트리밋(공용). AI 호출은 동기 완료라 동시 4·분당 40 — 초과 시 429.
const aiLimiter = makeRateLimiter({ concurrent: 4, perMinute: 40 });

interface AiBody {
  system?: string;
  prompt?: string;
  diagram?: unknown;
  availableNodeTypes?: string[];
  selectedNodes?: unknown;
  selectedNodeId?: string | null;
}

aiRouter.post("/copilot", aiLimiter, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as AiBody;

  if (typeof body.prompt !== "string" || body.prompt.trim() === "") {
    res.status(400).json({ error: "bad_request", message: "prompt 가 필요합니다.", operations: [] });
    return;
  }

  const availableNodeTypes =
    Array.isArray(body.availableNodeTypes) && body.availableNodeTypes.length > 0
      ? body.availableNodeTypes
      : ["user", "rectangle", "diamond", "rounded-rectangle"];

  try {
    const result = await callCopilot({
      system: body.system,
      prompt: body.prompt,
      diagram: body.diagram ?? { nodes: [], edges: [] },
      availableNodeTypes,
      selectedNodes: body.selectedNodes,
      selectedNodeId: body.selectedNodeId ?? null,
    });
    res.json({ message: result.message, operations: result.operations });
  } catch (err) {
    // callCopilot 은 안전 메시지 + status 를 담아 throw 한다(키 노출 0).
    safeLog("[ai] route error:", String(err));
    const status = err instanceof GitHubModelsError && err.status >= 400 && err.status < 600 ? err.status : 500;
    const message = err instanceof Error ? err.message : "AI 처리 중 오류가 발생했습니다.";
    res.status(status).json({ error: "ai_error", message, operations: [] });
  }
});

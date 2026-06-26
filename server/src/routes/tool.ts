/**
 * 도구 단독 실행 라우트(디버깅용).
 *   POST /api/tool/:name  { args } → { result }
 *
 * 보안은 runTool 내부(tools.ts)가 전담 — http_get 의 SSRF 차단/타임아웃/크기상한이 그대로 적용된다.
 * 변수참조({{ref}})는 여기선 해석하지 않는다(ctx 없음). 디버깅 시 리터럴 url 을 넣는다.
 *
 * 인증은 P7. 지금은 무인증 노출의 위험을 줄이기 위해 간이 캡(동시 3·분당 30)만 적용 — 초과 시 429.
 */
import { Router, type Request, type Response } from "express";
import { runTool, AVAILABLE_TOOLS, ToolError } from "../lib/tools.js";
import { makeRateLimiter } from "../util/rateLimit.js";
import { safeLog } from "../util/logRedact.js";

export const toolRouter = Router();

interface ToolBody {
  args?: Record<string, unknown>;
}

// 간이 레이트리밋(공용 미들웨어). 도구는 동시 3·분당 30 유지 — 초과 시 429.
toolRouter.use(makeRateLimiter({ concurrent: 3, perMinute: 30 }));

toolRouter.post("/:name", async (req: Request, res: Response) => {
  const name = req.params.name;
  if (!AVAILABLE_TOOLS.includes(name)) {
    res.status(404).json({ error: "not_found", message: `알 수 없는 도구입니다: "${name}".` });
    return;
  }

  const body = (req.body ?? {}) as ToolBody;
  const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? body.args : {};

  try {
    const result = await runTool(name, args);
    res.json({ result });
  } catch (e) {
    safeLog("[tool] error:", String(e));
    // ToolError 는 사용자 안전 메시지. 그 외는 일반화.
    const message = e instanceof ToolError ? e.message : "도구 실행 중 오류가 발생했습니다.";
    res.status(e instanceof ToolError ? 400 : 500).json({ error: "tool_error", message });
  }
});

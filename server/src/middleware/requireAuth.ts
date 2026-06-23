/**
 * 인증 가드. 세션에 githubToken 이 없으면 401.
 * 보호 라우트(예: /api/ai/copilot) 앞에 건다.
 */
import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.githubToken && req.session.user) {
    next();
    return;
  }
  res.status(401).json({
    error: "unauthorized",
    message: "GitHub 로그인이 필요합니다.",
  });
}

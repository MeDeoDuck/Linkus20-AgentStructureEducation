/**
 * GitHub OAuth 라우트.
 *
 *   GET  /api/auth/github           — state 생성 후 GitHub authorize 로 302
 *   GET  /api/auth/github/callback  — state 검증 → code→token 교환 → /user 조회 → 세션 저장 → 프론트로 리다이렉트
 *   GET  /api/auth/me               — { authenticated, user?, copilotAvailable } (토큰 제외)
 *   POST /api/auth/logout           — 세션 파기 + 쿠키 클리어
 */
import { Router, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { clearCookieOptions } from "../session.js";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchUser,
  checkCopilotAccess,
} from "../lib/github.js";
import { safeLog } from "../util/logRedact.js";

export const authRouter = Router();

/** CSRF state 생성. */
function makeState(): string {
  return randomBytes(24).toString("hex");
}

// ── GET /api/auth/github ──────────────────────────────────────────────────
// state 를 세션에 저장(서버측 CSRF 방어) 후 GitHub authorize 로 보낸다.
authRouter.get("/github", (req: Request, res: Response) => {
  if (!config.github.clientId || !config.github.callbackUrl) {
    res.status(503).json({ error: "oauth_not_configured", message: "GitHub OAuth가 설정되지 않았습니다." });
    return;
  }
  const state = makeState();
  req.session.oauthState = state;
  // 세션 저장 후 리다이렉트(저장 보장).
  req.session.save((err) => {
    if (err) {
      safeLog("[auth] session save failed:", String(err));
      res.status(500).json({ error: "session_error", message: "세션 저장 실패." });
      return;
    }
    res.redirect(buildAuthorizeUrl(state));
  });
});

// ── GET /api/auth/github/callback ─────────────────────────────────────────
authRouter.get("/github/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };
  const expected = req.session.oauthState;

  // state(CSRF) 검증 — 일회용. 검증 후 즉시 삭제.
  req.session.oauthState = undefined;

  if (!code || !state || !expected || state !== expected) {
    safeLog("[auth] state mismatch or missing code/state");
    // 실패는 프론트로 에러 플래그와 함께 리다이렉트(상세는 노출 안 함).
    res.redirect(`${config.frontendOrigin}/?auth=error`);
    return;
  }

  try {
    const token = await exchangeCodeForToken(code); // server-to-server
    const user = await fetchUser(token.accessToken);
    const copilotAvailable = await checkCopilotAccess(token.accessToken);

    // 세션에만 저장 — 토큰은 절대 프론트로 나가지 않는다.
    req.session.githubToken = token.accessToken;
    req.session.user = user;
    req.session.copilotAvailable = copilotAvailable;

    req.session.save((err) => {
      if (err) {
        safeLog("[auth] session save failed (callback):", String(err));
        res.redirect(`${config.frontendOrigin}/?auth=error`);
        return;
      }
      safeLog("[auth] login ok:", user.login);
      res.redirect(`${config.frontendOrigin}/?auth=success`);
    });
  } catch (err) {
    safeLog("[auth] callback failed:", String(err));
    res.redirect(`${config.frontendOrigin}/?auth=error`);
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────
// 프론트가 로그인 상태를 확인하는 엔드포인트. 토큰은 절대 포함하지 않는다.
authRouter.get("/me", (req: Request, res: Response) => {
  const authenticated = Boolean(req.session.githubToken && req.session.user);
  res.json({
    authenticated,
    user: authenticated ? req.session.user : undefined,
    copilotAvailable: authenticated ? Boolean(req.session.copilotAvailable) : false,
  });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────
authRouter.post("/logout", (req: Request, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      safeLog("[auth] session destroy failed:", String(err));
      res.status(500).json({ error: "logout_error", message: "로그아웃 실패." });
      return;
    }
    res.clearCookie("diagram.sid", clearCookieOptions); // 생성 옵션과 대칭(삭제 호환)
    res.json({ ok: true });
  });
});

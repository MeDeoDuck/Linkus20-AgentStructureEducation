/**
 * Express 앱 부팅.
 * - CORS: credentials 허용 + origin 을 FRONTEND_ORIGIN 으로 한정(쿠키 세션이 동작하려면 필수).
 * - 세션 미들웨어
 * - 라우터 마운트: /api/auth, /api/ai
 *
 * 실행: npm run dev (tsx watch) / 빌드 후 npm start (node dist/index.js)
 */
import path from "node:path";
import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { sessionMiddleware } from "./session.js";
import { authRouter } from "./routes/auth.js";
import { aiRouter } from "./routes/ai.js";
import { safeLog } from "./util/logRedact.js";

const app = express();

// 프록시(예: 배포 환경 https 종단) 뒤에서 Secure 쿠키가 동작하려면 필요.
if (config.cookieSecure) {
  app.set("trust proxy", 1);
}

// CORS: 분리 배포(프론트 도메인 != 백엔드)일 때만 적용. same-origin 배포면 불필요.
if (config.frontendOrigin) {
  app.use(
    cors({
      origin: config.frontendOrigin,
      credentials: true,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"],
    })
  );
}

app.use(express.json({ limit: "1mb" }));
app.use(sessionMiddleware);

// 헬스체크.
app.get("/health", (_req, res) => {
  res.json({ ok: true, env: config.nodeEnv });
});

// 라우터.
app.use("/api/auth", authRouter);
app.use("/api/ai", aiRouter);

// 프로덕션: 프론트 빌드(dist) 정적 서빙 + SPA fallback(같은 도메인에서 한 번에 제공).
// 빌드 산출물은 레포 루트 dist/ 이고, 시작 명령은 레포 루트에서 실행된다.
if (config.isProd) {
  const distDir = path.resolve(process.cwd(), "dist");
  app.use(express.static(distDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
}

// 미매칭(주로 /api/*) 404.
app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.listen(config.port, () => {
  safeLog(`[server] listening on http://localhost:${config.port} (env=${config.nodeEnv})`);
  safeLog(`[server] CORS origin = ${config.frontendOrigin}`);
  if (!config.cookieSecure) {
    safeLog("[server] ⚠️ Secure 쿠키 비활성(개발 모드). https 배포 시 COOKIE_SECURE=true 설정 필요.");
  }
});

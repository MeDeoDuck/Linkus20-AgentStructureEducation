/**
 * 환경변수 로드 + 검증.
 * 필수 값이 없으면 부팅 시점에 즉시 죽여 잘못된 상태로 뜨는 것을 막는다.
 */
import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`[config] 필수 환경변수 누락: ${name} (.env 를 확인하세요. .env.example 참고)`);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

const IS_PROD = optional("NODE_ENV", "development") === "production";

export const config = {
  nodeEnv: optional("NODE_ENV", "development"),
  isProd: IS_PROD,
  port: Number(optional("PORT", "8787")),

  // CORS 오리진. 비우면 same-origin 배포(프론트+백엔드 같은 도메인)로 간주해 CORS 미적용.
  // 분리 배포일 때만 프론트 도메인을 지정한다.
  frontendOrigin: optional("FRONTEND_ORIGIN", ""),

  // 쿠키 Secure — NODE_ENV=production 이거나 COOKIE_SECURE=true 면 적용(https 필수).
  cookieSecure: optional("COOKIE_SECURE", "") === "true" || IS_PROD,

  // GitHub OAuth — mock 배포(USE_MOCK)에서는 /api/auth 를 안 쓰므로 부팅 필수에서 제외.
  // 실제 OAuth 사용 시 채운다(미설정이면 auth 라우트가 안전 에러를 반환).
  github: {
    clientId: optional("GITHUB_CLIENT_ID", ""),
    clientSecret: optional("GITHUB_CLIENT_SECRET", ""),
    callbackUrl: optional("GITHUB_CALLBACK_URL", ""),
    // TODO: 공식 문서 확인 필요 — Copilot 접근에 필요한 정확한 OAuth scope.
    //  read:user 는 /user 조회용으로 확실. Copilot 관련 scope 는 추정값(placeholder).
    //  GitHub OAuth scope 문서: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
    scope: "read:user copilot",
  },

  session: {
    secret: required("SESSION_SECRET"),
    // 세션 만료(쿠키 maxAge). MVP: 8시간.
    maxAgeMs: 1000 * 60 * 60 * 8,
  },
} as const;

export type AppConfig = typeof config;

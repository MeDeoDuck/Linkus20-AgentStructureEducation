/**
 * 환경변수 로드 + 검증. (인증 제거 → GitHub/세션 관련 설정 없음)
 * AI 키(RUNYOURAI_*)는 lib/copilot.ts 가 process.env 에서 직접 읽는다.
 */
import "dotenv/config";

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : fallback;
}

const IS_PROD = optional("NODE_ENV", "development") === "production";

export const config = {
  nodeEnv: optional("NODE_ENV", "development"),
  isProd: IS_PROD,
  port: Number(optional("PORT", "8787")),

  // CORS 오리진. 비우면 same-origin 배포로 간주해 CORS 미적용. 분리 배포일 때만 지정.
  frontendOrigin: optional("FRONTEND_ORIGIN", ""),

  // 프록시(https 종단) 뒤 trust proxy 여부.
  cookieSecure: optional("COOKIE_SECURE", "") === "true" || IS_PROD,
} as const;

export type AppConfig = typeof config;

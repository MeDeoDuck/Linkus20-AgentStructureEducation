/**
 * 세션 정의.
 *
 * 저장소: express-session 기본 MemoryStore (프로세스 메모리 Map).
 *   ⚠️ 프로덕션은 Redis(connect-redis) 권장 — MemoryStore 는:
 *     1) 단일 프로세스에서만 유효(수평 확장/PM2 cluster 불가)
 *     2) 재시작 시 전체 세션 소실
 *     3) 만료 세션을 적극 GC 하지 않아 메모리 누수 위험
 *   MVP(외부 DB 불필요)이므로 의도적으로 MemoryStore 사용. 운영 전환 시 store 만 교체.
 *
 * 쿠키 보안: httpOnly(JS 접근 차단), Secure(prod 에서만 — https 필요),
 *   SameSite=Lax(CSRF 완화 + OAuth 리다이렉트 호환), maxAge(세션 만료).
 *
 * 세션에 담는 것: githubToken(절대 프론트로 안 나감), user(공개 가능 프로필),
 *   copilotAvailable(권한 확인 결과), oauthState(CSRF state, 콜백에서 검증 후 삭제).
 */
import session from "express-session";
import { config } from "./config.js";

/** 프론트로 노출 가능한 공개 사용자 프로필(토큰 제외). */
export interface SessionUser {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

// express-session 의 SessionData 를 확장해 우리 필드를 타입 안전하게 추가.
declare module "express-session" {
  interface SessionData {
    /** GitHub access token. 서버 내부 전용 — 어떤 응답에도 포함하지 않는다. */
    githubToken?: string;
    /** 공개 가능한 사용자 프로필. */
    user?: SessionUser;
    /** Copilot 사용 가능 여부(권한 확인 결과). */
    copilotAvailable?: boolean;
    /** OAuth CSRF state. authorize 진입 시 저장, callback 에서 검증 후 삭제. */
    oauthState?: string;
  }
}

/** express-session 미들웨어 구성. */
export const sessionMiddleware = session({
  name: "diagram.sid",
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  rolling: true, // 활동 시 만료시간 갱신
  // store 미지정 → 기본 MemoryStore. (프로덕션은 Redis store 주입)
  cookie: {
    httpOnly: true,
    secure: config.cookieSecure, // COOKIE_SECURE=true 또는 prod (https 필수)
    sameSite: "lax",
    maxAge: config.session.maxAgeMs,
    path: "/",
  },
});

/** 로그아웃 시 clearCookie 에 넘길, 생성 옵션과 대칭인 쿠키 옵션(일부 브라우저 삭제 호환). */
export const clearCookieOptions = {
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: "lax" as const,
  path: "/",
};

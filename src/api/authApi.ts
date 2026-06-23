/**
 * 백엔드 인증 API 래퍼. 프론트는 토큰을 절대 다루지 않고 httpOnly 쿠키 세션만 사용한다.
 * 모든 요청에 credentials:"include" → 세션 쿠키 자동 전송.
 */
import type { GitHubUser } from "../ai/types";

/** 백엔드 베이스 URL. dev에서 백엔드가 다른 포트면 VITE_API_BASE 로 지정(예: http://localhost:8787). */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? "";

export interface MeResponse {
  authenticated: boolean;
  user?: GitHubUser;
  copilotAvailable?: boolean;
}

/** 현재 로그인 상태 조회. 백엔드 미가동/네트워크 오류면 throw. */
export async function fetchMe(): Promise<MeResponse> {
  const res = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
  if (!res.ok) throw new Error(`auth/me ${res.status}`);
  return res.json();
}

/** GitHub OAuth 로그인 시작(백엔드가 authorize 로 리다이렉트). */
export function startGitHubLogin(): void {
  window.location.href = `${API_BASE}/api/auth/github`;
}

/** 로그아웃(서버 세션 폐기). */
export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, { method: "POST", credentials: "include" });
}

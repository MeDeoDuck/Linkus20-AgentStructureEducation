/**
 * GitHub OAuth + 사용자 조회 헬퍼.
 *
 * 보안: client_secret 은 이 모듈(서버)에서만 사용한다. code→token 교환은
 *   server-to-server 로만 일어나며, 토큰은 호출자(세션)에게만 반환된다.
 *   토큰을 로그에 찍지 않는다(필요 시 maskToken).
 */
import { config } from "../config.js";
import type { SessionUser } from "../session.js";
import { maskToken, safeLog } from "../util/logRedact.js";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_USER_URL = "https://api.github.com/user";

/** authorize 리다이렉트 URL 생성(state 포함). */
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: config.github.clientId,
    redirect_uri: config.github.callbackUrl,
    scope: config.github.scope, // TODO: 공식 문서 확인 필요 — Copilot 정확 scope
    state,
    allow_signup: "false",
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

export interface TokenResult {
  accessToken: string;
  scope: string;
  tokenType: string;
}

/**
 * authorization code 를 access token 으로 교환(server-to-server).
 * client_secret 을 여기서만 사용한다.
 */
export async function exchangeCodeForToken(code: string): Promise<TokenResult> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: config.github.clientId,
      client_secret: config.github.clientSecret, // 서버에서만
      code,
      redirect_uri: config.github.callbackUrl,
    }),
  });

  if (!res.ok) {
    // 상태코드만 노출. 본문(토큰/시크릿 가능성)은 마스킹 후만.
    throw new Error(`GitHub 토큰 교환 실패 (HTTP ${res.status}).`);
  }

  const data = (await res.json()) as {
    access_token?: string;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  if (data.error || !data.access_token) {
    // 상세 사유는 마스킹 로그로만, 사용자/상위로는 고정 메시지(일반화 일관 적용).
    safeLog("[github] token exchange rejected:", data.error ?? "unknown_error");
    throw new Error("GitHub 인증에 실패했습니다. 다시 시도해 주세요.");
  }

  safeLog("[github] token exchanged:", maskToken(data.access_token));

  return {
    accessToken: data.access_token,
    scope: data.scope ?? "",
    tokenType: data.token_type ?? "bearer",
  };
}

/** 토큰으로 /user 프로필 조회. 공개 가능 필드만 추려 반환. */
export async function fetchUser(accessToken: string): Promise<SessionUser> {
  const res = await fetch(GITHUB_API_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "aiagent-diagram-server",
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub 사용자 조회 실패 (HTTP ${res.status}).`);
  }

  const u = (await res.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
  };

  return {
    id: u.id,
    login: u.login,
    name: u.name ?? null,
    avatarUrl: u.avatar_url ?? null,
  };
}

/**
 * Copilot 사용 가능 여부 확인.
 *
 * 개인 사용자의 Copilot 구독을 "사전" 확인하는 공개 REST API는 존재하지 않는다
 * (org/enterprise 레벨 `/orgs/ORG/copilot/billing` 만 있고 read:org/manage_billing:copilot scope 필요).
 * 따라서 로그인된 사용자는 일단 사용 가능으로 간주하고, 실제 가능 여부는
 * Copilot SDK 호출(/api/ai/copilot) 시점에 판정한다(실패하면 안전 에러로 안내).
 *
 * 참고: https://docs.github.com/en/rest/copilot/copilot-user-management
 */
export async function checkCopilotAccess(accessToken: string): Promise<boolean> {
  void accessToken;
  return true;
}

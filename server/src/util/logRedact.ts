/**
 * 로그 마스킹 유틸.
 * 토큰/시크릿이 로그·에러로 새어 나가지 않도록 민감 문자열을 가린다.
 * 절대 토큰을 그대로 console 에 찍지 말고, 반드시 이 함수를 거친다.
 */

/** GitHub 토큰/시크릿류 패턴 + 일반 secret 표기. */
const SENSITIVE_PATTERNS: RegExp[] = [
  /gh[oprsu]_[A-Za-z0-9]{20,}/g, // ghp_, gho_, ghu_, ghs_, ghr_ (GitHub tokens)
  /github_pat_[A-Za-z0-9_]{20,}/g, // fine-grained PAT
  /(client_secret|access_token|refresh_token|authorization|bearer)\s*[=:]\s*["']?[A-Za-z0-9._\-]+/gi,
];

/**
 * 알려진 실제 시크릿 값(런타임에 등록). 패턴 매칭이 못 잡는 형식(JWT, raw 등)도
 * 정확한 값으로 가린다. 예: Copilot 호출 직전 githubToken 을 등록 → SDK 원본 에러에
 * 토큰이 박혀 있어도 마스킹됨.
 */
const dynamicSecrets = new Set<string>();

/** 마스킹할 실제 시크릿 값 등록(8자 미만 무시 — 오탐 방지). */
export function registerSecret(value: string | undefined | null): void {
  if (value && value.length >= 8) dynamicSecrets.add(value);
}

/** 문자열 안의 민감 토큰을 *** 로 치환. */
export function redact(input: string): string {
  let out = input;
  // (1) 알려진 시크릿 정확값 우선 치환.
  for (const s of dynamicSecrets) {
    if (out.includes(s)) out = out.split(s).join("***redacted***");
  }
  // (2) 접두사 패턴 기반 치환.
  for (const re of SENSITIVE_PATTERNS) {
    out = out.replace(re, (m) => maskMatch(m));
  }
  return out;
}

function maskMatch(m: string): string {
  // key=value 형태면 value 만 가리고 key 는 남긴다.
  const kv = m.match(/^([A-Za-z_]+\s*[=:]\s*["']?)(.+)$/);
  if (kv) return `${kv[1]}***redacted***`;
  // 순수 토큰이면 앞 4글자만 노출.
  return `${m.slice(0, 4)}***redacted***`;
}

/** 임의 토큰 한 개를 앞 4글자만 남기고 마스킹. */
export function maskToken(token: string | undefined | null): string {
  if (!token) return "(none)";
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}…***`;
}

/** 객체를 안전하게 로그용 문자열로 직렬화(민감 키 제거 + 토큰 패턴 마스킹). */
export function safeStringify(obj: unknown): string {
  const SENSITIVE_KEYS = new Set([
    "githubToken",
    "client_secret",
    "clientSecret",
    "access_token",
    "accessToken",
    "authorization",
    "cookie",
    "secret",
  ]);
  try {
    const json = JSON.stringify(obj, (key, value) => {
      if (SENSITIVE_KEYS.has(key)) return "***redacted***";
      return value;
    });
    return redact(json ?? "");
  } catch {
    return "[unserializable]";
  }
}

/** 안전 로그 헬퍼. 모든 인자를 redact 한 뒤 출력. */
export function safeLog(...args: unknown[]): void {
  const parts = args.map((a) => (typeof a === "string" ? redact(a) : safeStringify(a)));
  // eslint-disable-next-line no-console
  console.log(...parts);
}

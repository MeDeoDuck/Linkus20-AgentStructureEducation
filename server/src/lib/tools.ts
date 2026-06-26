/**
 * 도구(tool) 디스패처 — 화이트리스트 레지스트리. (P4)
 *
 * 보안 핵심(SSRF 방어):
 *  - http_get 은 http/https 스킴만 허용.
 *  - 호스트네임을 DNS 로 해석(IP 리터럴 포함)해 **사설/내부/링크로컬/메타데이터 IP 를 전부 차단**.
 *  - **DNS rebinding 방지**: 검증한 IP 로 핀(pin)해서 연결(node:http/https 가 IP 로 직접 connect,
 *    Host 헤더·TLS SNI 는 원 호스트네임 유지) → fetch 의 2차 DNS 재해석 TOCTOU 제거.
 *  - 전체 deadline(8s, 연결+본문 — slowloris 차단), 응답 크기 상한(256KB, 스트리밍 중 차단),
 *    리다이렉트(3xx) 자동추적 없음(거부).
 *  - IPv6 는 ::ffff:(hex/십진), ::a.b.c.d(compat), 64:ff9b::/96(NAT64) 의 내장 v4 를 환산해 재검사.
 *  - 알 수 없는 도구는 throw(화이트리스트 외 실행 불가).
 *
 * web_search 는 실제 검색 API 가 없으므로 가짜 결과를 만들지 않고 명확히 미구현으로 throw.
 */
import { lookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";

const HTTP_TIMEOUT_MS = 8000;
const MAX_BYTES = 256 * 1024; // 256KB
const MAX_TEXT_RETURN = 8000; // ctx 로 넘길 텍스트 길이 상한(토큰 폭증 방지)

/** 호출자에게 안전 메시지를 전달하기 위한 도구 오류. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

// ---------------------------------------------------------------------------
// SSRF: 사설/내부 IP 판별
// ---------------------------------------------------------------------------

/** IPv4 문자열을 32bit 정수로. 형식 오류면 null. */
function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map((n) => Number(n));
  if (parts.some((n) => n < 0 || n > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function inV4Range(ipInt: number, cidr: string): boolean {
  const [base, bitsStr] = cidr.split("/");
  const baseInt = ipv4ToInt(base);
  if (baseInt == null) return false;
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

/** 차단 대상 IPv4 사설/예약/링크로컬/메타데이터 대역. */
const BLOCKED_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10", // CGNAT
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local (169.254.169.254 메타데이터 포함)
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.88.99.0/24", // 6to4 relay anycast
  "192.168.0.0/16",
  "198.18.0.0/15",
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved (E class)
];

/**
 * IPv6 문자열을 16바이트로 정규화. `::` 압축과 끝자리 내장 IPv4(`::ffff:1.2.3.4`)를 처리.
 * 형식 오류면 null. (hex/십진 우회를 막기 위해 항상 바이트 단위로 비교)
 */
function parseIPv6ToBytes(input: string): Uint8Array | null {
  let addr = input.trim().toLowerCase();
  const pct = addr.indexOf("%"); // zone id 제거
  if (pct >= 0) addr = addr.slice(0, pct);
  if (!addr.includes(":")) return null;

  // 끝 그룹이 내장 IPv4(점 포함)면 두 hextet 으로 환산.
  const expandV4 = (groups: string[]): string[] | null => {
    if (!groups.length) return groups;
    const last = groups[groups.length - 1];
    if (last.includes(".")) {
      const v4 = ipv4ToInt(last);
      if (v4 == null) return null;
      const hi = ((v4 >>> 16) & 0xffff).toString(16);
      const lo = (v4 & 0xffff).toString(16);
      return [...groups.slice(0, -1), hi, lo];
    }
    return groups;
  };

  const parts = addr.split("::");
  if (parts.length > 2) return null;
  let head = parts[0] === "" ? [] : parts[0].split(":");
  let tail = parts.length === 2 ? (parts[1] === "" ? [] : parts[1].split(":")) : [];
  const headE = expandV4(head);
  const tailE = expandV4(tail);
  if (!headE || !tailE) return null;
  head = headE;
  tail = tailE;

  let groups: string[];
  if (parts.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 0) return null;
    groups = [...head, ...new Array(missing).fill("0"), ...tail];
  } else {
    groups = head; // `::` 없으면 정확히 8그룹이어야 함
  }
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const g = groups[i];
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const v = parseInt(g, 16);
    bytes[i * 2] = (v >> 8) & 0xff;
    bytes[i * 2 + 1] = v & 0xff;
  }
  return bytes;
}

/** 단일 해석 주소가 차단 대상인지(IPv4/IPv6). */
function isBlockedAddress(address: string, family: number): boolean {
  if (family === 4) {
    const i = ipv4ToInt(address);
    if (i == null) return true; // 파싱 불가 → 안전하게 차단
    return BLOCKED_V4.some((c) => inV4Range(i, c));
  }
  // IPv6 — 바이트 단위로 정규화해 hex/십진 우회를 차단.
  const b = parseIPv6ToBytes(address);
  if (!b) return true; // 파싱 불가 → 안전하게 차단
  const allZeroUntil = (n: number) => b.slice(0, n).every((x) => x === 0);

  // ::  (unspecified) / ::1 (loopback)
  if (allZeroUntil(16)) return true;
  if (allZeroUntil(15) && b[15] === 1) return true;
  // fc00::/7 (ULA: fc.. fd..)
  if ((b[0] & 0xfe) === 0xfc) return true;
  // fe80::/10 (링크로컬)
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true;

  // 내장 IPv4 를 가진 prefix 들 → 마지막 32비트를 v4 로 재검사(hex/십진 불문).
  const isMapped = allZeroUntil(10) && b[10] === 0xff && b[11] === 0xff; // ::ffff:0:0/96
  const isCompat = allZeroUntil(12); // ::a.b.c.d (deprecated IPv4-compat)
  const isNat64 = b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && b.slice(4, 12).every((x) => x === 0); // 64:ff9b::/96
  if (isMapped || isCompat || isNat64) {
    const v4 = (((b[12] << 24) >>> 0) + (b[13] << 16) + (b[14] << 8) + b[15]) >>> 0;
    return BLOCKED_V4.some((c) => inV4Range(v4, c));
  }
  return false;
}

/**
 * hostname 을 DNS 해석해 **모든** 주소가 안전한지 검사하고, 안전하면 핀(pin)할 IP 를 반환.
 * 내부/사설이면 ToolError throw. (반환 IP 로 직접 연결 → rebinding 차단)
 */
async function assertPublicHost(hostname: string): Promise<{ address: string; family: number }> {
  const host = hostname.trim().toLowerCase();
  if (!host) throw new ToolError("URL 호스트가 비어 있습니다.");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new ToolError("내부 호스트로의 요청은 차단됩니다.");
  }
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new ToolError("호스트 이름을 확인할 수 없습니다.");
  }
  if (!addrs.length) throw new ToolError("호스트 주소를 확인할 수 없습니다.");
  for (const a of addrs) {
    if (isBlockedAddress(a.address, a.family)) {
      throw new ToolError("사설/내부 IP 로의 요청은 보안상 차단됩니다(SSRF 방지).");
    }
  }
  // 모두 통과 → 첫 주소로 핀(이후 fetch 가 재해석하지 않도록 IP 직접 연결).
  return { address: addrs[0].address, family: addrs[0].family };
}

/**
 * 검증·핀된 IP 로 직접 GET. node:http/https 로 IP 에 connect 하고 Host 헤더/TLS SNI 는 원 호스트네임 유지.
 * 전체 deadline(연결+본문) 으로 slowloris 차단, 본문 스트리밍 중 크기상한 차단, 3xx 는 거부.
 */
function httpGetPinned(url: URL, pin: { address: string; family: number }): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const isHttps = url.protocol === "https:";
    const reqFn = isHttps ? httpsRequest : httpRequest;
    const port = url.port ? Number(url.port) : isHttps ? 443 : 80;

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      fn();
    };

    // 전체 상한(연결+본문). 초과 시 소켓 파괴 → slowloris/무한본문 차단.
    const deadline = setTimeout(() => {
      finish(() => {
        req.destroy();
        reject(new ToolError("http_get: 요청 시간이 초과되었습니다(타임아웃)."));
      });
    }, HTTP_TIMEOUT_MS);

    const req = reqFn(
      {
        host: pin.address, // 핀: 검증된 IP 로 직접 connect(2차 DNS 없음)
        family: pin.family,
        port,
        path: (url.pathname || "/") + url.search,
        method: "GET",
        servername: isHttps ? url.hostname : undefined, // TLS SNI + 인증서 검증 대상
        headers: {
          Host: url.host, // vhost 라우팅용 원 호스트네임 유지
          Accept: "text/*, application/json;q=0.9, */*;q=0.1",
          "User-Agent": "ai-agent-sim-tool/1.0",
        },
      },
      (res: IncomingMessage) => {
        const status = res.statusCode ?? 0;
        // 3xx 리다이렉트는 따라가지 않고 거부(우회로 사설망 접근 방지).
        if (status >= 300 && status < 400) {
          finish(() => {
            res.destroy();
            reject(new ToolError("http_get: 리다이렉트 응답은 허용되지 않습니다."));
          });
          return;
        }
        if (status < 200 || status >= 300) {
          finish(() => {
            res.destroy();
            reject(new ToolError(`http_get: HTTP ${status}`));
          });
          return;
        }
        // content-length 가 미리 상한 초과면 즉시 거부.
        const len = Number(res.headers["content-length"] ?? "");
        if (Number.isFinite(len) && len > MAX_BYTES) {
          finish(() => {
            res.destroy();
            reject(new ToolError(`http_get: 응답이 너무 큽니다(${len} bytes).`));
          });
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (c: Buffer) => {
          total += c.length;
          if (total > MAX_BYTES) {
            finish(() => {
              res.destroy();
              reject(new ToolError(`http_get: 응답이 상한(${MAX_BYTES} bytes)을 초과했습니다.`));
            });
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          finish(() => {
            const text = Buffer.concat(chunks).toString("utf-8").slice(0, MAX_TEXT_RETURN);
            resolve(text);
          });
        });
        res.on("error", () => finish(() => reject(new ToolError("http_get: 응답 수신 중 오류가 발생했습니다."))));
      },
    );

    req.on("error", () => finish(() => reject(new ToolError("http_get: 요청 실패(연결 오류)."))));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// 도구 구현
// ---------------------------------------------------------------------------

async function httpGet(args: Record<string, unknown>): Promise<string> {
  const rawUrl = typeof args.url === "string" ? args.url.trim() : "";
  if (!rawUrl) throw new ToolError("http_get: url 인자가 필요합니다.");

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ToolError("http_get: 올바른 URL 형식이 아닙니다.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ToolError("http_get: http/https 스킴만 허용됩니다.");
  }
  // SSRF 차단: DNS 해석 후 전 주소 사설 검사 → 통과한 IP 로 핀(rebinding 방지).
  const pin = await assertPublicHost(url.hostname);
  return httpGetPinned(url, pin);
}

async function webSearch(): Promise<string> {
  // 실제 검색 API 키가 없으므로 가짜 결과를 만들지 않고 명확히 미구현으로 처리.
  throw new ToolError(
    "web_search 는 검색 API 키가 필요합니다(후속 단계에서 지원 예정). 지금은 http_get 도구를 사용하세요.",
  );
}

/** 화이트리스트 도구 레지스트리. 여기 없는 이름은 실행 불가. */
const REGISTRY: Record<string, (args: Record<string, unknown>) => Promise<string>> = {
  http_get: httpGet,
  web_search: webSearch,
};

export const AVAILABLE_TOOLS = Object.keys(REGISTRY);

/**
 * 도구 실행 디스패처. args 의 변수참조({{ref}})는 호출부(runEngine)에서 이미 해석해 넘긴다.
 * @throws ToolError — 라우트/runNode 가 사용자 메시지로 매핑.
 */
export async function runTool(name: string, args: Record<string, unknown>): Promise<string> {
  const fn = REGISTRY[name];
  if (!fn) throw new ToolError(`알 수 없는 도구입니다: "${name}". 사용 가능: ${AVAILABLE_TOOLS.join(", ")}`);
  return fn(args ?? {});
}

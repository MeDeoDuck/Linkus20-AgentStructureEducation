# GitHub Copilot 로그인 + 사용자 자기부담 AI — 조사 보고서

> 작성: research 팀(꼬부기·피카츄) + agent-simulator 보조(젠슨황) · 2026-06-23
> 대상: `AIAgentSimulation` 웹 다이어그램 편집기에 "방문자가 GitHub Copilot 계정으로 로그인 → AI 설계 도움 → **토큰 비용은 방문자 본인 부담**" 붙이기

---

## TL;DR (한 줄 결론)

- **2026-06-02 GitHub Copilot SDK가 정식 출시(GA)** 되면서, "우리 웹앱에 Copilot 임베드 + GitHub 로그인 + 사용자 본인 구독으로 과금"이 **이제 공식적으로·약관 안전하게 가능**해졌다. (이전엔 불가능/약관위반이었음)
- 요구가 **"GitHub Copilot 계정 로그인 + 본인 Copilot 과금"이 핵심**이면 → **Copilot SDK + GitHub OAuth**.
- 구현 단순·모델 자유도가 더 중요하면 → **BYOK(사용자가 본인 OpenAI/Anthropic 키 입력, 본인 과금)** 가 가장 쉽고 리스크 최저.
- 실전 권장: **하이브리드** — GitHub 로그인은 신원+무료 맛보기 채널, 본격 사용은 BYOK 폴백.
- ⚠️ 리버스 엔지니어링 프록시(`copilot-api` 류)는 **ToS 위반·계정정지 위험**으로 금지.

---

## 1. 핵심 사실 — 무엇이 가능한가 (검증됨)

### ✅ GitHub Copilot SDK (2026-06-02 GA) — 직접 검증 완료
- "Copilot의 agentic 엔진을 **본인 앱/서비스/도구에 임베드**"하는 공식·안정 API. 프로덕션 지원.
- 언어: **TypeScript/Node.js**, Python, Go, .NET, Java, Rust (6종). → 우리 React/TS 스택과 직결.
- 인증: **GitHub OAuth · GitHub Apps · 환경 토큰 · BYOK(OpenAI/Anthropic/Azure Foundry 등)** 전부 지원.
- 대상: **Copilot Free 포함 모든 Copilot 구독자**, 비구독자는 BYOK로.
- **과금: SDK 호출은 사용자의 premium request/토큰 쿼터에 카운트** → 즉 **사용자 본인 부담** ✓ (요구사항 충족).
- 출처: [Copilot SDK GA changelog (2026-06-02)](https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/) · [github/copilot-sdk repo](https://github.com/github/copilot-sdk) · [BYOK 인증 docs](https://docs.github.com/en/copilot/how-tos/copilot-sdk/authenticate-copilot-sdk/bring-your-own-key)

### ⚠️ 확인 필요
- Copilot SDK가 노출하는 것은 **agent runtime**(계획·툴 호출·파일 편집·멀티턴)이지 단순 chat completions가 아님. 우리 "자연어 → 다이어그램 operations JSON" **단발 생성**엔 다소 오버스펙일 수 있음. → custom tools + system prompt 커스터마이즈로 맞출 수 있으나, 실제 API 표면에서 단발 생성 비용/지연이 합리적인지 PoC 필요.
- Copilot은 **2026-06-01부터 토큰 기반 과금**으로 전환(입력/출력/캐시 토큰). 일부 보도는 체감 비용 상승 언급(2차 출처, [enterprisedna](https://enterprisedna.co/resources/news/github-copilot-usage-based-billing-enterprise-2026/)) — 수치는 확인 필요.

---

## 2. 선택지 비교

| 방식 | 비용 주체 | 모델 선택폭 | 약관 리스크 | 구현 난이도 | GitHub 로그인 |
|---|---|---|---|---|---|
| **A. Copilot SDK + GitHub OAuth** | **사용자 본인 Copilot 구독/쿼터** | Copilot 모델 | **낮음(공식 GA)** | 중 (3/5) | ✅ 핵심 |
| **B. BYOK (본인 LLM 키)** | **사용자 본인 OpenAI/Anthropic 계정** | Claude/GPT/Gemini 전부 | **낮음(직접 계약)** | **낮음 (2/5)** | 선택 |
| **C. GitHub OAuth + GitHub Models** | 사용자(본인 `models:read` 토큰 + paid opt-in) | GitHub Models 카탈로그 | 중(프리뷰·상업적합성 확인필요) | 중 | ✅ |
| **D. 우리가 부담 + 쿼터 제한** | **우리 회사** | 우리가 정함 | 낮음(비용폭발 위험) | 중 | 선택 |
| ❌ copilot-api 리버스 프록시 | 사용자(비공식) | Copilot | **높음(ToS위반·정지)** | — | — |

### 보조 사실 (피카츄, 출처 포함)
- **GitHub Models**: `models:read` 권한 fine-grained PAT/GitHub App 필요(2025-05-15부터). 비용은 "요청 토큰 소유 계정"에 귀속 → 사용자 토큰으로 호출 시 사용자 과금, 단 **사용자가 본인 계정에서 paid usage를 opt-in 해야** 무료한도(매우 낮음) 초과분 동작. 현재 **rate-limited 프리뷰**라 상용 트래픽엔 한계. ([billing docs](https://docs.github.com/billing/managing-billing-for-your-products/about-billing-for-github-models) · [models:read changelog](https://github.blog/changelog/2025-05-15-modelsread-now-required-for-github-models-access/))
- **로그인 ≠ Copilot 사용권**: 단순 OAuth 로그인(`read:user`)은 신원 확인일 뿐. Copilot/Models를 쓰려면 토큰에 해당 권한(`models:read` 또는 Copilot 권한)이 있어야 하고, 사용자가 **Copilot 구독이 없으면** SDK Copilot 모드 불가 → BYOK 폴백 필요.
- **Copilot Extensions(GitHub App 기반)는 사양화** — 2025-11-10 비활성, 후속은 **MCP 서버**. 단 MCP는 "우리 도구를 Copilot에 노출"하는 **반대 방향**이라(사용자가 자기 IDE/Copilot Chat에서 우리 툴 호출) 우리 시나리오(우리 웹 UI 안에서 AI)와 안 맞음. ([deprecation changelog](https://github.blog/changelog/2025-09-24-deprecate-github-copilot-extensions-github-apps/))

---

## 3. 우리 코드에 붙이는 설계 (젠슨황)

기존 구조의 강점: AI 호출이 이미 **provider 패턴**으로 추상화됨.
- `src/ai/types.ts` → `interface AIProvider { generateDiagramEdit(req): Promise<DiagramAIResponse> }`
- `src/ai/providers/index.ts` → `USE_MOCK` 토글 + 모델별 registry
- `src/ai/providers/backendProvider.ts` → 자체 백엔드 `/api/ai/<model>` 프록시 (**키는 백엔드 보관, 프론트 노출 금지**)

### 핵심 레버 (3안 공통)
**provider 인터페이스(`generateDiagramEdit`)는 건드리지 않는다.** 인증/과금은 **전송 계층(httpOnly 쿠키 세션 + 얇은 프록시)** 에서 끝낸다. `backendProvider`의 fetch에 한 줄만:

```ts
const res = await fetch(endpoint, {
  method: "POST",
  credentials: "include",          // ← 추가: 쿠키 기반 세션/OAuth 공통
  headers: { "Content-Type": "application/json", ...extraHeaders },
  body: JSON.stringify({ ... }),
});
```

### 시나리오 A — GitHub OAuth + Copilot SDK / GitHub Models
흐름: `로그인 버튼 → GitHub 동의 → 콜백서 토큰 교환 → 서버가 httpOnly 쿠키 세션에 보관 → 프론트는 쿠키만 들고 /api/ai/<model> 호출 → 서버가 사용자 토큰으로 Copilot SDK / GitHub Models 호출`

최소 백엔드 엔드포인트:
```
GET  /api/auth/github          → GitHub authorize로 302 (state 발급, CSRF 방어)
GET  /api/auth/github/callback → code→access_token 교환, httpOnly·Secure 세션쿠키 set
GET  /api/auth/me              → 로그인 상태/유저명 (UI 게이팅용)
POST /api/auth/logout          → 세션 파기
POST /api/ai/:model            → 세션의 GitHub 토큰으로 Copilot SDK/Models 프록시
```
우리 코드 변경: `providers/index.ts`(`USE_MOCK=false` + `/api/auth/me`로 게이팅), `backendProvider.ts`(`credentials:"include"`), AI 패널 헤더에 "GitHub로 로그인" 버튼·상태 표시. **타입/`generateDiagramEdit` 변경 0.**

### 시나리오 B — BYOK (사용자 본인 키)
흐름: `패널에서 본인 OpenAI/Anthropic 키 입력 → 호출 시 키를 백엔드 프록시로 전달 → 백엔드가 그 키로 LLM 호출(과금=사용자 계정)`

키 저장(보안 등급순):
1. **서버 세션 보관(권장)**: `POST /api/keys`로 서버 세션에만 암호화 저장, 프론트로 다시 안 내려줌.
2. **프론트 메모리 + 매 요청 헤더 패스스루**: 서버에 키 안 남음(장점), XSS 시 탈취 위험.
3. ❌ **localStorage 평문 — 절대 금지**(XSS 영구 탈취).

### 시나리오 C — 우리 부담 + 쿼터 제한 (참고)
`POST /api/ai/:model`에 유저/IP별 쿼터 미들웨어(Redis 카운터) → 초과 시 429. 우리 코드 변경 거의 없음. **비용 폭발 위험 → 하드 상한 필수.**

### 보안 공통 수칙
- GitHub access token / LLM 키는 **절대 프론트로 내려보내지 않음**. httpOnly·Secure·SameSite=Lax 쿠키 세션에만.
- OAuth `state`로 CSRF 방어, 토큰 교환은 server-to-server(`client_secret`은 서버 env).
- 키는 마스킹 표시(`sk-…1234`), at-rest 암호화(KMS/libsodium), 로그·에러메시지에 키 포함 금지.

---

## 4. 추천 — 단계적 실행

**1순위: B(BYOK, 서버세션) + A(GitHub 로그인)를 무료 맛보기로 병행.**

근거:
1. **비용 안전** — 핵심 요구("우리가 비용 안 떠안음")를 BYOK가 가장 깔끔히 충족. C는 폭발 위험.
2. **기존 구조 정합** — provider 패턴에 BYOK가 자연스럽게 얹힘. `generateDiagramEdit` 시그니처 변경 0.
3. **모델 자유도** — 사용자가 Claude/GPT/Gemini 본인 키 선택.
4. **첫 방문자 이탈 보완** — BYOK의 "키 없는 첫 방문자 이탈" 약점을, A(GitHub 로그인 + 무료 맛보기)로 완충. 두 채널이 동일 `/api/ai/:model` 프록시 + 쿠키 세션 공유 → 백엔드 추가비용 작음.

단계:
- **1차(0.5~1일)**: BYOK 옵션2(프론트 메모리 키 + 패스스루 프록시). 즉시 검증.
- **2차(+1일)**: 서버세션(옵션1) + httpOnly 쿠키로 격상, XSS 리스크 제거.
- **3차(+1일)**: GitHub OAuth 채널 추가(맛보기 유입). Copilot SDK 모드는 PoC 후 결정.

손대는 파일: `providers/index.ts`(USE_MOCK off + 게이팅), `providers/backendProvider.ts`(credentials + 옵션 키헤더), AI 패널 UI(로그인/키입력), **신규 백엔드**(별도 서버 또는 서버리스 `/api`). `types.ts`·`generateDiagramEdit` 계약은 그대로.

---

## 5. 한계·미해결 (정직하게)

- Copilot SDK가 **단발 다이어그램 생성**에 비용/지연 측면에서 합리적인지 = **PoC 필요**(agent runtime 오버스펙 가능성).
- GitHub Models의 **상업 프로덕션 약관 적합성** 명시 미확인 → 본격 운영 전 GitHub 영업/약관 확인.
- Copilot SDK가 사용자 Copilot 구독 호출 시 요구하는 **정확한 OAuth scope/GitHub App permission 명칭**은 docs 미명시 → 구현 착수 시 확인.
- 토큰 과금 체감 상승 수치(2026-06-01 전환)는 2차 출처 → 실측 필요.

---

## 출처 모음
- [GitHub Copilot SDK GA changelog (2026-06-02)](https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/)
- [github/copilot-sdk repository](https://github.com/github/copilot-sdk)
- [Copilot SDK — BYOK 인증 docs](https://docs.github.com/en/copilot/how-tos/copilot-sdk/authenticate-copilot-sdk/bring-your-own-key)
- [GitHub Models billing docs](https://docs.github.com/billing/managing-billing-for-your-products/about-billing-for-github-models)
- [models:read 필수화 changelog (2025-05-15)](https://github.blog/changelog/2025-05-15-modelsread-now-required-for-github-models-access/)
- [Copilot Extensions(GitHub App) 사양화 changelog (2025-09-24)](https://github.blog/changelog/2025-09-24-deprecate-github-copilot-extensions-github-apps/)
- [OAuth scopes docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)
- [Copilot 토큰 과금 보도(2차)](https://enterprisedna.co/resources/news/github-copilot-usage-based-billing-enterprise-2026/)

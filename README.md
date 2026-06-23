# Linkus20 — 블록 기반 다이어그램 편집기 + GitHub Copilot AI Assistant

draw.io와 비슷하지만 **자유 드로잉이 아니라, 미리 정의된 블록을 배치·연결**해 다이어그램을 만드는 웹 편집기.
오른쪽 패널은 AI Assistant — **로그인 없이 바로** 자연어로 다이어그램 생성/수정을 요청한다.
AI 호출은 백엔드가 **RunYourAI(OpenAI 호환 게이트웨이)로 GPT**를 부른다. **API 키는 백엔드 env 전용, 프론트에 절대 노출 안 함.**

> ℹ️ **AI 경로 이력:** 초기엔 GitHub Copilot SDK → (조직 정책 막힘) GitHub Models → 최종 **운영자 키 기반 GPT(RunYourAI)**.
> GitHub 로그인·OAuth·세션은 모두 제거됨. 비용은 **운영자(키 소유자) 부담** — 사용량 상한 설정 권장.

## 주요 기능

- **3단 레이아웃** — 왼쪽 블록 팔레트 · 가운데 캔버스 · 오른쪽 Copilot AI 패널(접기/펼치기).
- **블록 편집** — 팔레트 클릭으로 추가, 드래그 이동, 클릭 선택, 더블클릭 텍스트 수정, `Delete` 삭제.
- **연결선** — 블록 간 화살표 연결, 블록 이동 시 자동 위치 갱신, 선택적 라벨.
- **JSON 저장/불러오기** — 현재 다이어그램을 `{nodes, edges}` JSON으로 내보내고 복원.
- **PNG 내보내기** — 캔버스를 이미지로 저장.
- **AI Assistant (Copilot)** — 자연어 요청 → AI가 **변경 제안(operations)** → 미리보기 → **적용/취소**. 적용 전까지 캔버스 미반영.
- **안전 적용** — operations 검증(존재하지 않는 id/허용 안 된 타입/중복 id/빈 배열 등) 통과 시에만 적용.

## 사용 가능한 블록 타입 (4개로 제한)

| type | 모양 | 용도 |
|---|---|---|
| `user` | 동그라미 | 사용자/행위자 |
| `rectangle` | 사각형 | 일반 처리 |
| `diamond` | 마름모 | 조건/분기 |
| `rounded-rectangle` | 둥근 사각형 | 시작/종료·페이지·단계 |

블록 데이터: `{ id, type, x, y, width, height, label }` · 연결선: `{ id, source, target, label? }` · 전체 상태: `{ nodes: [], edges: [] }`.
> 내부 코드는 `rounded-rectangle`을 `rounded`로 정규화해 다룬다(JSON 입출력·AI 계약은 `rounded-rectangle` 표기).

## 전체 아키텍처

```
[브라우저: React + Zustand]                 [백엔드: Express + TS]              [GitHub]
  왼쪽 팔레트 / 캔버스 / Copilot 패널
        │  쿠키 세션만 사용(토큰 0)
        ├── GET  /api/auth/github ─────────▶ authorize 302 ───────────────▶ OAuth 동의
        │                                    ◀── code 콜백 ───────────────────┘
        │                                    code→token 교환(server-to-server)
        │                                    토큰을 httpOnly 세션에 저장
        ├── GET  /api/auth/me ─────────────▶ { authenticated, user, copilotAvailable }
        ├── POST /api/auth/logout
        └── POST /api/ai/copilot ──────────▶ 세션 토큰으로 @github/copilot-sdk 호출 → operations JSON
```

핵심 원칙: **GitHub 토큰·client_secret·API Key는 프론트에 절대 노출하지 않는다.** OAuth·Copilot SDK 호출은 전부 백엔드.

### 폴더 구조
```
AIAgentSimulation/
  src/                      프론트엔드(Vite + React + TS)
    components/             BlockPalette(=Sidebar)/Canvas/AIAssistantPanel/LoginButton/TopBar ...
    store/                  useDiagramStore · useAIStore · useAuthStore (상태 분리)
    ai/                     types · systemPrompt · diagramBridge(검증·적용·정렬·직렬화) · providers(mock|copilot)
    api/                    authApi · copilotApi (백엔드 호출, credentials:include)
  server/                   백엔드(Express + TS) — OAuth + Copilot SDK
    src/routes|lib|middleware|util ...
    .env.example            백엔드 환경변수 템플릿
```

## GitHub Copilot 단일 경로 인증 구조

1. 사용자가 "GitHub로 로그인" 클릭 → 백엔드 `/api/auth/github`가 `state`(CSRF) 발급 후 GitHub authorize로 리다이렉트.
2. 콜백에서 `code`를 user access token으로 **server-to-server** 교환 → **httpOnly·Secure·SameSite=Lax 쿠키 세션**에 저장(프론트로 토큰 안 보냄).
3. 프론트는 `/api/auth/me`로 로그인 여부·Copilot 권한만 확인.
4. AI 요청은 `/api/ai/copilot`(경로명은 호환 위해 유지) → 백엔드가 세션 토큰으로 **GitHub Models API**(`https://models.github.ai/inference/chat/completions`) 호출 → 응답을 정규화해 `{message, operations}`로 반환.
5. 사용자가 **적용하기**를 누르기 전까지 캔버스 미반영.

## 실행 방법

### 프론트엔드
```bash
npm install
cp .env.example .env.local      # 필요 시 VITE_API_BASE 수정
npm run dev                     # http://localhost:5173
npm run build                   # 타입체크(tsc) + 프로덕션 빌드
```
> 기본은 **데모 모드**(`src/ai/providers/index.ts`의 `USE_MOCK = true`). 백엔드 없이 mock AI로 전체 흐름을 바로 체험할 수 있다(로그인은 데모 사용자로 자동 처리). 실제 Copilot 연동은 `USE_MOCK = false`.

### 백엔드
```bash
cd server
npm install
cp .env.example .env            # 아래 환경변수 채우기
npm run dev                     # 기본 http://localhost:8787
```

## GitHub OAuth App 생성 방법

1. GitHub → **Settings → Developer settings → OAuth Apps(또는 GitHub Apps) → New**.
2. **Authorization callback URL**: `http://localhost:8787/api/auth/github/callback` (배포 시 실제 도메인).
3. 발급된 **Client ID / Client secret**을 백엔드 `.env`에 입력.

## 환경변수

**프론트 (`.env.local`)**
```
VITE_API_BASE=http://localhost:8787
```
**백엔드 (`server/.env`)** — `.env`는 절대 커밋하지 않는다(`.env.example`만 제공).
```
RUNYOURAI_BASE_URL=https://<runyourai-host>/v1
RUNYOURAI_API_KEY=
RUNYOURAI_MODEL=gpt-4.1
NODE_ENV=development
PORT=8787
# FRONTEND_ORIGIN 은 분리 배포일 때만(같은 도메인 단일 배포면 비워둠)
```
> GitHub OAuth/로그인은 제거됨 — 로그인 없이 바로 AI 사용. AI 키는 위 `RUNYOURAI_*`(백엔드 env)에만 둔다.

## 학생용 안내 (GitHub Education / Copilot)

1. GitHub 계정을 만든다.
2. [GitHub Education](https://education.github.com/) 학생 인증을 진행한다(학교 이메일/재학 증명).
3. GitHub Copilot 사용 권한이 활성화됐는지 확인한다(Student Developer Pack에 Copilot 포함).
4. 이 웹사이트에서 **"GitHub로 로그인"** 버튼을 누른다.
5. 본인 GitHub 계정으로 로그인한다.
6. 오른쪽 AI Assistant 패널에서 자연어로 다이어그램 생성을 요청한다 (예: "회원가입 플로우 만들어줘").
7. AI가 제안한 변경사항을 확인한 뒤 **"적용하기"**를 누른다.

> AI 토큰 비용은 **본인 Copilot 쿼터**에서 차감된다(운영자 부담 아님).

## 보안 주의사항

- GitHub token은 **프론트로 전달하지 않고** localStorage/sessionStorage에도 저장하지 않는다(httpOnly 쿠키 세션만).
- 세션 쿠키는 `httpOnly`·`Secure`(프로덕션)·`SameSite=Lax`.
- OAuth `state`로 CSRF 방어. `client_secret`은 서버 환경변수에만.
- 로그에 access token / client secret을 출력하지 않는다(`util/logRedact`로 마스킹).
- 로그아웃 시 서버 세션 폐기 + 쿠키 클리어. 세션 만료(maxAge) 적용.
- AI 호출 실패 시 사용자에게는 **안전한 에러 메시지만** 노출(스택/토큰 0).

## 개발 순서 (구현 단계)

1. React 3단 레이아웃 + 팔레트/캔버스 + 블록 추가·이동·삭제.
2. 텍스트 수정 + 연결선(+자동 위치 갱신) + JSON 저장/불러오기.
3. AI 패널 UI + mockProvider + operations 미리보기/적용/취소 + 검증.
4. 백엔드: GitHub OAuth + 세션 쿠키 + `/api/auth/me`·`/logout`.
5. `@github/copilot-sdk` + `/api/ai/copilot` + 프론트 연결(`USE_MOCK=false`).
6. 에러/권한없음/세션만료 처리 + 보안 점검.

## ⚠️ 알려진 한계 (정직하게)

- **Copilot SDK(`@github/copilot-sdk` v1.x)는 단발 chat-completion이 아니라 로컬 Copilot CLI 런타임을 구동**하는 방식이다.
  서버 머신에 해당 플랫폼 런타임 바이너리 + 유효한 Copilot 인증이 있어야 실제 호출이 성공한다. 배포 환경(리눅스 컨테이너 등)에서 별도 검증 필요.
- 다음은 **공식 문서 확인 필요**로 코드에 `// TODO` 표기됨: Copilot 접근용 정확한 OAuth scope명, Copilot 권한 확인 API, SDK 모델 매핑.
- 현재 기본은 데모(mock) 모드 — 실제 Copilot 호출은 위 런타임 조건을 갖춘 뒤 `USE_MOCK=false`로 검증한다.

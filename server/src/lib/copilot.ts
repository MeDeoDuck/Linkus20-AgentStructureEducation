/**
 * GitHub Copilot SDK 래퍼.
 *
 * 실제 SDK(@github/copilot-sdk v1.x)는 "Copilot CLI 를 JSON-RPC 로 구동하는" 클라이언트다.
 * chat-completion 단발 API 가 아니라 세션 기반:
 *     new CopilotClient({ gitHubToken, useLoggedInUser:false })
 *       → client.start()
 *       → client.createSession({ onPermissionRequest: approveAll, model? })
 *       → session.sendAndWait({ prompt }) → event.data.content (텍스트)
 *       → session.disconnect() / client.stop()  (정리)
 *
 *  ⚠️ 이 SDK 는 로컬에 Copilot CLI 런타임 바이너리(@github/copilot-*)가 설치돼 있어야
 *     실제로 동작한다. 서버 환경에 런타임이 없으면 client.start() 단계에서 실패한다.
 *     (npm i 시 copilot-win32-x64 런타임이 함께 설치됨 — 플랫폼별 패키지.)
 *
 * 보안: 세션 githubToken 으로만 호출. 토큰은 응답/로그에 절대 포함하지 않는다.
 * 견고성: LLM 응답에서 코드펜스 제거 → 첫 '{' ~ 마지막 '}' 슬라이스 → JSON.parse
 *         → {message, operations} 형태 검증. 어느 단계든 실패하면 안전 에러로 throw.
 */
import { registerSecret, safeLog } from "../util/logRedact.js";
import { normalizeDiagramOperations } from "./normalizeOps.js";

/**
 * AI 호출 = RunYourAI(OpenAI 호환 게이트웨이)로 GPT 호출. 운영자 키(서버 env) 사용 → 비용 운영자 부담.
 * 키는 프론트에 노출 안 함. GitHub 로그인/토큰 불필요.
 *  RUNYOURAI_BASE_URL : OpenAI 호환 base (예: https://.../v1) — 코드가 /chat/completions 를 붙임
 *  RUNYOURAI_API_KEY  : RunYourAI API 키(필수)
 *  RUNYOURAI_MODEL    : 모델명(기본 gpt-4.1)
 */
const AI_BASE_URL = (process.env.RUNYOURAI_BASE_URL ?? "").replace(/\/$/, "");
const AI_API_KEY = process.env.RUNYOURAI_API_KEY ?? "";
const AI_MODEL = process.env.RUNYOURAI_MODEL ?? "gpt-4.1";

/** status 코드를 담아 라우트가 사용자 친화 응답으로 매핑하게 한다. */
export class GitHubModelsError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "AIError";
  }
}

function friendlyModelsError(status: number): string {
  if (status === 401) return "AI 인증에 실패했습니다(서버 키 확인 필요).";
  if (status === 403) return "AI 사용 권한이 없습니다(서버 키 권한 확인 필요).";
  if (status === 429) return "AI 사용 한도에 도달했습니다. 잠시 후 다시 시도해주세요.";
  if (status >= 500) return "AI 호출 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  return "AI 요청 처리 중 오류가 발생했습니다.";
}

/** 프론트(systemPrompt.ts)와 일치시킨 시스템 프롬프트. 4종 블록 + operations JSON only. */
export const SYSTEM_PROMPT = `당신은 draw.io-lite 웹 다이어그램 편집기에 내장된 AI 어시스턴트입니다.
사용자의 한국어 요청을 받아 다이어그램을 편집하는 operations(JSON)를 생성하는 것이 당신의 유일한 임무입니다.

# 출력 형식 (반드시 준수)
- 응답은 오직 다음 형태의 순수 JSON 객체 하나입니다:
  {"message": string, "operations": Operation[]}
- 코드펜스(\`\`\`), 마크다운, 주석, 사족, 인사말을 절대 붙이지 마십시오. JSON 외 텍스트는 0바이트여야 합니다.
- "message"는 한국어 1~2문장으로 무엇을 했는지 요약합니다.
- 다이어그램을 바꾸지 않는 설명/질문 요청이면 "operations"는 빈 배열 []이고, "message"에 답을 담습니다.

# 블록 타입 (이 4개만 허용)
- "user"      : 사람/외부 행위자 (예: 사용자, 관리자)
- "rectangle" : 일반 시스템/서버/컴포넌트
- "rounded"   : 프로세스/페이지/단계 (둥근 사각형, 요청의 "rounded-rectangle")
- "diamond"   : 조건/분기/판단 (성공·실패, Yes·No)
위 4개 외의 type은 절대 생성하지 마십시오. 애매하면 "rectangle"을 사용합니다.

# operation 종류 (각 operation 객체는 "type" 키로 종류를 지정)
addNode | updateNode | deleteNode | addEdge | updateEdge | deleteEdge | moveNode | layoutDiagram
- addNode: 새 노드. id는 충돌하지 않게 "node-<의미>-<짧은해시>" 규칙으로 직접 생성.
- addEdge: id는 "edge-<source>-<target>" 규칙. source/target은 반드시 실재하는 노드 id여야 합니다.
- layoutDiagram: 전체 자동 정렬. 기본 direction "LR".

# 무결성 규칙 (위반 금지)
- 존재하지 않는 노드/엣지 id를 source, target, update, delete, move 대상으로 절대 참조하지 마십시오.
  같은 응답 안에서 새로 만든 노드는 같은 응답의 엣지에서 참조해도 됩니다.
- 사용자가 명시하지 않은 노드를 임의로 삭제하지 마십시오.
- 요청을 수행할 수 없으면 operations를 []로 두고 message로 이유와 대안을 안내합니다.

# 좌표 배치 가이드
- 흐름 방향은 왼쪽 → 오른쪽. 첫 노드는 (x≈80, y≈200) 근처에서 시작.
- 같은 흐름의 다음 노드는 x를 약 200 증가시킵니다 (x, x+200, x+400 ...).
- 분기(diamond에서 갈라질 때)는 y를 위/아래로 약 120 벌립니다.
- 노드끼리 겹치지 않도록 좌표를 계산하십시오.

# operations 구조 (반드시 중첩 구조 사용)
addNode 는 반드시 다음 형식을 사용한다(필드를 평탄하게 펼치지 마라):
{ "type": "addNode", "node": { "id": "...", "type": "user | rectangle | diamond | rounded-rectangle", "x": number, "y": number, "width": number, "height": number, "label": "..." } }
addEdge 는 반드시 다음 형식을 사용한다:
{ "type": "addEdge", "edge": { "id": "...", "source": "...", "target": "...", "label": "..." } }

주의:
- operation 의 "type"(addNode, addEdge 같은 명령)과 노드의 타입을 혼동하지 마라.
- 노드 타입은 반드시 node.type 안에 넣어라. "nodeType" 이라는 키를 절대 쓰지 마라.
- id, x, y, label 등을 operation 최상위에 펼치지 말고 node/edge 객체 안에 넣어라.

다시 강조: 순수 JSON 한 객체만 출력하십시오. 마크다운 코드블록 금지.`;

/** Operation/응답 타입(프론트 types.ts 와 형태 동일). */
export interface DiagramAIResponse {
  message: string;
  operations: unknown[]; // 프론트에서 Operation[] 로 정밀 검증. 서버는 형태만 보장.
}

export interface CopilotCallInput {
  /** 프론트가 system 을 보내면 그것을, 없으면 서버 기본 SYSTEM_PROMPT 사용. */
  system?: string;
  prompt: string;
  diagram: unknown;
  availableNodeTypes: string[];
  /** 선택 노드(프론트는 배열 selectedNodes). 단일 id 도 허용. */
  selectedNodes?: unknown;
  selectedNodeId?: string | null;
  /** 모델 힌트(선택). SDK createSession 의 model 로 전달. */
  model?: string;
}

/**
 * GitHub Models REST API 로 다이어그램 operations 생성 → {message, operations} 반환.
 * 사용자의 개인 GitHub access token(models:read)으로 호출 → 비용은 사용자 계정.
 * (함수명은 프론트/라우트 호환을 위해 callCopilot 유지.)
 * @throws GitHubModelsError(status 포함) — 라우트가 사용자 친화 응답으로 매핑.
 */
export async function callCopilot(input: CopilotCallInput): Promise<DiagramAIResponse> {
  if (!AI_API_KEY || !AI_BASE_URL) {
    throw new GitHubModelsError(500, "AI가 설정되지 않았습니다(서버 키 미설정).");
  }
  // 응답/로그에 운영자 키가 섞여도 마스킹되도록 등록.
  registerSecret(AI_API_KEY);

  const system = input.system?.trim() ? input.system : SYSTEM_PROMPT;
  const userContent = JSON.stringify({
    prompt: input.prompt,
    diagram: input.diagram,
    availableNodeTypes: input.availableNodeTypes,
    selectedNodes: input.selectedNodes ?? [],
    selectedNodeId: input.selectedNodeId ?? null,
  });

  let res: Response;
  try {
    res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        temperature: 0.2,
      }),
    });
  } catch (e) {
    safeLog("[ai] network error:", String(e));
    throw new GitHubModelsError(502, "AI 호출 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
  }

  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* ignore */
    }
    safeLog(`[ai] HTTP ${res.status}:`, detail); // 본문은 마스킹 로그만(키 노출 0)
    throw new GitHubModelsError(res.status, friendlyModelsError(res.status));
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new GitHubModelsError(502, "AI 응답이 비어 있습니다.");
  }

  // 파싱 후 정규화: 모델이 평탄/nodeType 구조를 줘도 프론트 표준 operation 형식으로 통일.
  const parsed = parseDiagramResponse(content);
  return normalizeDiagramOperations(parsed);
}

/**
 * LLM 텍스트를 견고하게 {message, operations} 로 파싱.
 * 1) 코드펜스 제거 2) 첫 '{' ~ 마지막 '}' 슬라이스 3) JSON.parse 4) 형태 검증
 */
export function parseDiagramResponse(raw: string): DiagramAIResponse {
  if (!raw || typeof raw !== "string") {
    throw new Error("AI 응답이 비어 있습니다.");
  }

  // 1) 코드펜스 제거 (```json ... ``` / ``` ... ```)
  let text = raw.trim();
  text = text.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```$/m, "").trim();

  // 2) 첫 '{' ~ 마지막 '}' 슬라이스 (앞뒤 잡설 제거)
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) {
    throw new Error("AI 응답에서 JSON 객체를 찾지 못했습니다.");
  }
  const sliced = text.slice(first, last + 1);

  // 3) parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(sliced);
  } catch {
    throw new Error("AI 응답 JSON 파싱에 실패했습니다.");
  }

  // 4) 형태 검증
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI 응답 형식이 올바르지 않습니다.");
  }
  const obj = parsed as Record<string, unknown>;
  const message = typeof obj.message === "string" ? obj.message : "";
  const operations = Array.isArray(obj.operations) ? obj.operations : null;

  if (operations === null) {
    throw new Error("AI 응답에 operations 배열이 없습니다.");
  }

  return { message, operations };
}

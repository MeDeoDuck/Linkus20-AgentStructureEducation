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
import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { maskToken, registerSecret, safeLog } from "../util/logRedact.js";
import { normalizeDiagramOperations } from "./normalizeOps.js";

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
  githubToken: string;
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

/** Copilot 에 보낼 user 메시지 본문 구성: 시스템지침 + 요청 + 컨텍스트 직렬화. */
function buildPrompt(input: CopilotCallInput): string {
  const system = input.system?.trim() ? input.system : SYSTEM_PROMPT;
  const ctx = {
    availableNodeTypes: input.availableNodeTypes,
    diagram: input.diagram,
    selectedNodes: input.selectedNodes ?? [],
    selectedNodeId: input.selectedNodeId ?? null,
  };
  // SDK 세션은 system role 분리 주입이 까다로우므로(런타임이 자체 system prompt 관리),
  // 지침을 프롬프트 앞에 명시적으로 박아 넣어 JSON-only 출력을 강제한다.
  return [
    system,
    "",
    "────────────────────────",
    `사용자 요청:\n${input.prompt}`,
    "",
    "현재 컨텍스트(JSON):",
    JSON.stringify(ctx),
    "",
    "위 컨텍스트를 반영해 operations JSON 한 객체만 반환하십시오. 코드펜스·설명 금지.",
  ].join("\n");
}

/**
 * Copilot 호출 → {message, operations} 반환.
 * @throws 안전한 에러(토큰 미포함)만 던진다.
 */
export async function callCopilot(input: CopilotCallInput): Promise<DiagramAIResponse> {
  // SDK 원본 에러에 토큰이 섞여 던져져도 로그에서 마스킹되도록 실제 값 등록(접두사 패턴 무관).
  registerSecret(input.githubToken);
  safeLog("[copilot] calling with token:", maskToken(input.githubToken));

  const client = new CopilotClient({
    gitHubToken: input.githubToken,
    useLoggedInUser: false,
  });

  let rawText: string;
  let session: Awaited<ReturnType<CopilotClient["createSession"]>> | undefined;

  try {
    // 1) 런타임 구동(로컬 Copilot CLI 런타임 필요).
    await client.start();

    // 2) 세션 생성. 권한 요청은 자동 승인(approveAll) — 우리는 텍스트 생성만 한다.
    //    TODO: 공식 문서 확인 필요 — 모델명 표기(예: "gpt-4o" 등) 및 가용 모델은 client.listModels() 로 확인.
    session = await client.createSession({
      onPermissionRequest: approveAll,
      ...(input.model ? { model: input.model } : {}),
    });

    // 3) 메시지 전송 후 최종 assistant 응답 대기.
    const event = await session.sendAndWait({ prompt: buildPrompt(input) });
    rawText = event?.data?.content ?? "";

    if (!rawText) {
      throw new Error("AI 응답이 비어 있습니다.");
    }
  } catch (err) {
    // 토큰/내부정보가 메시지에 섞이지 않도록 일반화한 메시지만 노출.
    safeLog("[copilot] call failed:", String(err));
    throw new Error("AI 호출에 실패했습니다. 잠시 후 다시 시도해 주세요.");
  } finally {
    // 4) 정리 — 세션/클라이언트 해제(메모리/런타임 누수 방지).
    try {
      await session?.disconnect();
    } catch (e) {
      safeLog("[copilot] session disconnect failed:", String(e));
    }
    try {
      await client.stop();
    } catch (e) {
      safeLog("[copilot] client stop failed:", String(e));
    }
  }

  // 파싱 후 정규화: Copilot 의 평탄/nodeType 구조를 프론트 표준 operation 형식으로 통일.
  const parsed = parseDiagramResponse(rawText);
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

/**
 * 실제 AI API 없이 동작하는 규칙 기반 provider.
 * 사용자 자연어를 키워드로 매칭해 샘플 operations 를 반환한다.
 * 실 API provider 로 교체할 때 이 파일을 대체하면 된다(인터페이스 동일).
 */
import type { AIProvider, DiagramAIRequest, DiagramAIResponse, Operation } from "../types";
import { summarizeOperation } from "../diagramBridge";

let seq = 0;
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

const has = (text: string, ...keys: string[]) => keys.some((k) => text.includes(k));

/** 로그인/회원가입 류의 선형 플로우 + 분기를 생성. */
function authFlow(title: string, withBranch: boolean): { message: string; operations: Operation[] } {
  const uId = uid("node-user");
  const pageId = uid("node-page");
  const srvId = uid("node-server");
  const ops: Operation[] = [
    { type: "addNode", node: { id: uId, type: "user", x: 80, y: 220, width: 110, height: 110, label: "사용자" } },
    { type: "addNode", node: { id: pageId, type: "rounded", x: 280, y: 235, width: 160, height: 80, label: `${title} 페이지` } },
    { type: "addNode", node: { id: srvId, type: "rectangle", x: 520, y: 235, width: 160, height: 80, label: "인증 서버" } },
    { type: "addEdge", edge: { id: uid("edge"), source: uId, target: pageId, label: "접속" } },
    { type: "addEdge", edge: { id: uid("edge"), source: pageId, target: srvId, label: "요청" } },
  ];
  let message = `${title} 흐름을 제안했습니다: 사용자 → ${title} 페이지 → 인증 서버.`;
  if (withBranch) {
    const condId = uid("node-cond");
    const okId = uid("node-ok");
    const failId = uid("node-fail");
    ops.push(
      { type: "addNode", node: { id: condId, type: "diamond", x: 760, y: 225, width: 140, height: 110, label: "성공?" } },
      { type: "addNode", node: { id: okId, type: "rounded", x: 980, y: 140, width: 150, height: 70, label: "메인 화면" } },
      { type: "addNode", node: { id: failId, type: "rounded", x: 980, y: 320, width: 150, height: 70, label: "오류 표시" } },
      { type: "addEdge", edge: { id: uid("edge"), source: srvId, target: condId, label: "검증" } },
      { type: "addEdge", edge: { id: uid("edge"), source: condId, target: okId, label: "성공" } },
      { type: "addEdge", edge: { id: uid("edge"), source: condId, target: failId, label: "실패" } }
    );
    message += " 성공/실패 분기까지 포함했습니다.";
  }
  return { message, operations: ops };
}

function describe(req: DiagramAIRequest): string {
  const { nodes, edges } = req.diagram;
  if (!nodes.length) return "현재 캔버스가 비어 있습니다. 블록을 추가해 보세요.";
  const labels = nodes.map((n) => `"${n.label || n.type}"`).join(", ");
  const flow = edges.length
    ? edges.map((e) => {
        const s = nodes.find((n) => n.id === e.source)?.label ?? e.source;
        const t = nodes.find((n) => n.id === e.target)?.label ?? e.target;
        return `${s} →${e.label ? ` ${e.label} →` : ""} ${t}`;
      }).join("\n")
    : "(연결선 없음)";
  return `블록 ${nodes.length}개: ${labels}\n흐름:\n${flow}`;
}

function respond(req: DiagramAIRequest): DiagramAIResponse {
  const t = req.prompt.toLowerCase();

  // JSON 내보내기
  if (has(t, "json", "내보내", "export")) {
    return { message: "현재 다이어그램 JSON:\n" + JSON.stringify(req.diagram, null, 2), operations: [] };
  }
  // 설명
  if (has(t, "설명", "흐름 설명", "explain", "describe")) {
    return { message: describe(req), operations: [] };
  }
  // 정렬/정리
  if (has(t, "정렬", "정리", "보기 좋", "보기좋", "align", "layout", "왼쪽에서 오른쪽", "왼→오")) {
    return {
      message: "전체 흐름을 왼쪽 → 오른쪽으로 자동 정렬합니다.",
      operations: [{ type: "layoutDiagram", direction: t.includes("위") || t.includes("세로") ? "TB" : "LR" }],
    };
  }
  // 이름 변경 (선택 노드 대상)
  if (has(t, "이름", "바꿔", "변경", "rename", "수정")) {
    const target = req.selectedNodes[0];
    if (!target) {
      return { message: "이름을 바꿀 블록을 먼저 선택해 주세요.", operations: [] };
    }
    // 따옴표 안 또는 "...로/으로" 패턴에서 새 이름 추출(없으면 기본값).
    const m = req.prompt.match(/["'“]([^"'”]+)["'”]/) || req.prompt.match(/([^\s]+)\s*(?:로|으로)\s*(?:바꿔|변경)/);
    const newLabel = m ? m[1] : "고객";
    return {
      message: `"${target.label}" 블록의 이름을 "${newLabel}"(으)로 바꿉니다.`,
      operations: [{ type: "updateNode", id: target.id, patch: { label: newLabel } }],
    };
  }
  // 로그인 플로우
  if (has(t, "로그인", "login", "signin", "sign in")) {
    return authFlow("로그인", has(t, "성공", "실패", "분기", "조건", "branch"));
  }
  // 회원가입 플로우
  if (has(t, "회원가입", "가입", "signup", "sign up", "register")) {
    return authFlow("회원가입", has(t, "성공", "실패", "분기", "조건", "branch"));
  }
  // 조건/분기 추가
  if (has(t, "조건", "분기", "성공", "실패", "branch", "diamond", "마름모")) {
    const condId = uid("node-cond");
    const okId = uid("node-ok");
    const failId = uid("node-fail");
    return {
      message: "조건 분기(성공/실패)를 추가합니다.",
      operations: [
        { type: "addNode", node: { id: condId, type: "diamond", x: 560, y: 225, width: 140, height: 110, label: "성공?" } },
        { type: "addNode", node: { id: okId, type: "rounded", x: 780, y: 140, width: 150, height: 70, label: "성공" } },
        { type: "addNode", node: { id: failId, type: "rounded", x: 780, y: 320, width: 150, height: 70, label: "실패" } },
        { type: "addEdge", edge: { id: uid("edge"), source: condId, target: okId, label: "예" } },
        { type: "addEdge", edge: { id: uid("edge"), source: condId, target: failId, label: "아니오" } },
      ],
    };
  }
  // 단일 블록 추가
  if (has(t, "블록", "추가", "노드", "add", "만들")) {
    const id = uid("node");
    const type = has(t, "사용자", "유저", "user") ? "user"
      : has(t, "조건", "마름모", "diamond") ? "diamond"
      : has(t, "프로세스", "둥근", "rounded") ? "rounded"
      : "rectangle";
    return {
      message: "새 블록을 추가합니다.",
      operations: [{ type: "addNode", node: { id, type, x: 360, y: 240, width: 160, height: 90, label: "새 블록" } }],
    };
  }

  // fallback
  return {
    message:
      "요청을 이해하지 못했어요. 예: \"로그인 플로우 만들어줘\", \"전체 보기 좋게 정리해줘\", \"이 다이어그램 설명해줘\", \"성공/실패 조건 추가해줘\".",
    operations: [],
  };
}

export const mockProvider: AIProvider = {
  name: "mock",
  async generateDiagramEdit(input: DiagramAIRequest): Promise<DiagramAIResponse> {
    // 실제 호출처럼 약간의 지연.
    await new Promise((r) => setTimeout(r, 350));
    const res = respond(input);
    // 디버그 편의: 콘솔에 요약.
    if (res.operations.length) {
      console.debug("[mockProvider] operations:", res.operations.map(summarizeOperation));
    }
    return res;
  },
};

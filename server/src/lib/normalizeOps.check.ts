/**
 * normalizeDiagramOperations 수동 검증 스크립트.
 * 실행: npx tsx src/lib/normalizeOps.check.ts
 */
import { normalizeDiagramOperations } from "./normalizeOps.js";

let pass = 0;
let fail = 0;
function check(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    pass++;
    console.log(`✅ ${name}`);
  } else {
    fail++;
    console.log(`❌ ${name}\n   got : ${g}\n   want: ${w}`);
  }
}

// A: 평탄 addNode (nodeType, width/height 누락)
check(
  "A. flat addNode → nested + width/height 기본",
  normalizeDiagramOperations({
    message: "회원가입 플로우를 생성했습니다.",
    operations: [{ type: "addNode", id: "node-user-001", nodeType: "user", x: 80, y: 200, label: "사용자" }],
  }),
  {
    message: "회원가입 플로우를 생성했습니다.",
    operations: [
      { type: "addNode", node: { id: "node-user-001", type: "user", x: 80, y: 200, width: 100, height: 100, label: "사용자" } },
    ],
  }
);

// B: 평탄 addEdge → edge 래퍼
check(
  "B. flat addEdge → edge 래퍼",
  normalizeDiagramOperations({
    operations: [{ type: "addEdge", id: "edge-001", source: "node-user-001", target: "node-signup-001", label: "접속" }],
  }),
  { message: "", operations: [{ type: "addEdge", edge: { id: "edge-001", source: "node-user-001", target: "node-signup-001", label: "접속" } }] }
);

// C: 이미 중첩 표준 → 그대로 유지
check(
  "C. nested addNode → 보존",
  normalizeDiagramOperations({
    operations: [{ type: "addNode", node: { id: "node-1", type: "rectangle", x: 100, y: 100, width: 160, height: 70, label: "처리" } }],
  }),
  { message: "", operations: [{ type: "addNode", node: { id: "node-1", type: "rectangle", x: 100, y: 100, width: 160, height: 70, label: "처리" } }] }
);

// D: rounded(별칭) → rounded-rectangle 표준화 + 기본 크기
check(
  "D. flat rounded → rounded-rectangle",
  normalizeDiagramOperations({ operations: [{ type: "addNode", id: "n1", nodeType: "rounded", x: 280, y: 200, label: "회원가입 시작" }] }),
  { message: "", operations: [{ type: "addNode", node: { id: "n1", type: "rounded-rectangle", x: 280, y: 200, width: 160, height: 70, label: "회원가입 시작" } }] }
);

// E: updateNode 평탄 → {id, patch} (node 래퍼 아님 — 프론트 계약)
check(
  "E. flat updateNode → {id, patch}",
  normalizeDiagramOperations({ operations: [{ type: "updateNode", id: "node-1", label: "고객" }] }),
  { message: "", operations: [{ type: "updateNode", id: "node-1", patch: { label: "고객" } }] }
);

// F: moveNode 평탄 → {id, x, y}
check(
  "F. flat moveNode → {id, x, y}",
  normalizeDiagramOperations({ operations: [{ type: "moveNode", id: "node-1", x: 200, y: 300 }] }),
  { message: "", operations: [{ type: "moveNode", id: "node-1", x: 200, y: 300 }] }
);

// G: 허용 안된 타입 → skip
check(
  "G. 허용 안된 타입 → skip(빈 operations)",
  normalizeDiagramOperations({ operations: [{ type: "addNode", id: "x", nodeType: "hexagon", x: 0, y: 0 }] }),
  { message: "", operations: [] }
);

// H: source/target 없는 addEdge → skip
check(
  "H. source 없는 addEdge → skip",
  normalizeDiagramOperations({ operations: [{ type: "addEdge", id: "e1", target: "n2" }] }),
  { message: "", operations: [] }
);

// I: operations 배열 아님 → 빈 배열, 크래시 없음
check("I. operations 누락 → 빈 배열", normalizeDiagramOperations({ message: "설명만" }), { message: "설명만", operations: [] });

// J: updateNode patch 중첩 + 타입 변경 (원이 major 1 회귀 방지)
check(
  "J. updateNode patch{type} → patch.type 보존",
  normalizeDiagramOperations({ operations: [{ type: "updateNode", id: "n1", patch: { type: "diamond", label: "분기" } }] }),
  { message: "", operations: [{ type: "updateNode", id: "n1", patch: { type: "diamond", label: "분기" } }] }
);

// K: updateEdge 평탄 → {id, patch}
check(
  "K. flat updateEdge → {id, patch}",
  normalizeDiagramOperations({ operations: [{ type: "updateEdge", id: "e1", label: "수정" }] }),
  { message: "", operations: [{ type: "updateEdge", id: "e1", patch: { label: "수정" } }] }
);

// L: layoutDiagram TB / 잘못된 방향 → LR 폴백
check(
  "L. layoutDiagram TB 보존",
  normalizeDiagramOperations({ operations: [{ type: "layoutDiagram", direction: "TB" }] }),
  { message: "", operations: [{ type: "layoutDiagram", direction: "TB" }] }
);
check(
  "M. layoutDiagram 잘못된 방향 → LR",
  normalizeDiagramOperations({ operations: [{ type: "layoutDiagram", direction: "XY" }] }),
  { message: "", operations: [{ type: "layoutDiagram", direction: "LR" }] }
);

console.log(`\n결과: ${pass} pass / ${fail} fail`);
if (fail > 0) process.exit(1);

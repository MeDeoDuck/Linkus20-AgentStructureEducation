import { useEffect } from "react";
import { useViewportStore } from "../store/useViewportStore";
import { useDiagramStore } from "../store/useDiagramStore";
import { useRunStore } from "../store/useRunStore";

/** 우클릭 레이어 메뉴: 맨 앞/앞/뒤/맨 뒤로 보내기 + (블록) 이 노드만 실행. 마우스 위치에 표시. */
export default function ContextMenu() {
  const menu = useViewportStore((s) => s.contextMenu);
  const close = useViewportStore((s) => s.closeContextMenu);
  const bringToFront = useDiagramStore((s) => s.bringToFront);
  const bringForward = useDiagramStore((s) => s.bringForward);
  const sendBackward = useDiagramStore((s) => s.sendBackward);
  const sendToBack = useDiagramStore((s) => s.sendToBack);

  const runStatus = useRunStore((s) => s.status);
  const hasRun = useRunStore((s) => !!s.current && s.current.nodeRuns.length > 0);
  const runSingleNode = useRunStore((s) => s.runSingleNode);

  const arrows = useDiagramStore((s) => s.arrows);
  const blocks = useDiagramStore((s) => s.blocks);
  const updateArrow = useDiagramStore((s) => s.updateArrow);
  const beginHistory = useDiagramStore((s) => s.beginHistory);

  // 외부 클릭 / ESC 로 닫기.
  useEffect(() => {
    if (!menu) return;
    const onDown = () => close();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", close);
    };
  }, [menu, close]);

  if (!menu) return null;

  const ref = menu.ref;
  const run = (fn: (r: typeof ref) => void) => () => {
    fn(ref);
    close();
  };

  const items: { label: string; fn: () => void }[] = [
    { label: "맨 앞으로 보내기", fn: run(bringToFront) },
    { label: "앞으로 보내기", fn: run(bringForward) },
    { label: "뒤로 보내기", fn: run(sendBackward) },
    { label: "맨 뒤로 보내기", fn: run(sendToBack) },
  ];

  // 블록 우클릭일 때만 단일 노드 실행 제공. 직전 Run 없거나 실행 중이면 비활성.
  const isBlock = ref.type === "block";
  const runDisabled = !hasRun || runStatus === "running";
  const onRunSingle = () => {
    if (runDisabled) return;
    runSingleNode(ref.id);
    close();
  };

  // 화살표 우클릭 + source 가 condition 노드면 분기(true/false) 라벨 지정 UI 노출.
  const arrow = ref.type === "arrow" ? arrows.find((a) => a.id === ref.id) : undefined;
  const sourceBlock = arrow?.startConnection
    ? blocks.find((b) => b.id === arrow.startConnection!.blockId)
    : undefined;
  const isConditionEdge = !!arrow && sourceBlock?.nodeRole === "condition";
  const setBranch = (branch: "true" | "false" | undefined) => () => {
    if (!arrow) return;
    beginHistory();
    updateArrow(arrow.id, { conditionBranch: branch });
    close();
  };

  return (
    <div
      className="context-menu"
      style={{ left: menu.x, top: menu.y }}
      // 메뉴 자체 클릭이 외부-클릭 닫기로 잡히지 않도록.
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isBlock && (
        <>
          <button
            className="context-menu__item"
            onClick={onRunSingle}
            disabled={runDisabled}
            title={runDisabled ? "먼저 전체 실행이 필요합니다." : "직전 실행의 앞 노드 출력을 재사용해 이 노드만 실행"}
            style={runDisabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
          >
            ▶ 이 노드만 실행
          </button>
          <div className="context-menu__sep" style={{ borderTop: "1px solid #e5e7eb", margin: "4px 0" }} />
        </>
      )}
      {isConditionEdge && (
        <>
          <div style={{ fontSize: 11, color: "#6b7280", padding: "2px 10px" }}>
            조건 분기 {arrow?.conditionBranch ? `(현재: ${arrow.conditionBranch})` : "(미지정)"}
          </div>
          <button className="context-menu__item" onClick={setBranch("true")}>
            가지: true
          </button>
          <button className="context-menu__item" onClick={setBranch("false")}>
            가지: false
          </button>
          <button className="context-menu__item" onClick={setBranch(undefined)}>
            가지: 없음(항상)
          </button>
          <div className="context-menu__sep" style={{ borderTop: "1px solid #e5e7eb", margin: "4px 0" }} />
        </>
      )}
      {items.map((it) => (
        <button key={it.label} className="context-menu__item" onClick={it.fn}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

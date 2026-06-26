import { useRef } from "react";
import { useDiagramStore } from "../store/useDiagramStore";
import { useViewportStore } from "../store/useViewportStore";
import { useRunStore } from "../store/useRunStore";
import { graphToSlice, parseDiagramGraph, serializeGraph, toGraph } from "../ai/diagramBridge";

interface TopBarProps {
  onSave: () => void;
  onSaveSized: () => void;
  saving: boolean;
}

export default function TopBar({ onSave, onSaveSized, saving }: TopBarProps) {
  const title = useDiagramStore((s) => s.title);
  const setTitle = useDiagramStore((s) => s.setTitle);
  const selection = useDiagramStore((s) => s.selection);
  const canUndo = useDiagramStore((s) => s.past.length > 0);
  const canRedo = useDiagramStore((s) => s.future.length > 0);

  const undo = useDiagramStore((s) => s.undo);
  const redo = useDiagramStore((s) => s.redo);
  const group = useDiagramStore((s) => s.group);
  const ungroup = useDiagramStore((s) => s.ungroup);
  const duplicateSelection = useDiagramStore((s) => s.duplicateSelection);
  const alignSelection = useDiagramStore((s) => s.alignSelection);
  const distributeSelection = useDiagramStore((s) => s.distributeSelection);

  const zoom = useViewportStore((s) => s.zoom);
  const zoomIn = useViewportStore((s) => s.zoomIn);
  const zoomOut = useViewportStore((s) => s.zoomOut);
  const resetZoom = useViewportStore((s) => s.resetZoom);

  const runStatus = useRunStore((s) => s.status);
  const togglePanel = useRunStore((s) => s.togglePanel);

  const multi = selection.length >= 2;
  const many = selection.length >= 3;

  const fileRef = useRef<HTMLInputElement>(null);

  const handleExportJson = () => {
    const { blocks, arrows, title: t } = useDiagramStore.getState();
    // 워크플로우 메타(title) + 실행필드(nodeRole/config/prompt/conditionBranch, P1) 포함 직렬화.
    const data = { title: t, ...serializeGraph(toGraph(blocks, arrows)) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${t || "diagram"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const graph = parseDiagramGraph(parsed);
      const { blocks, arrows } = graphToSlice(graph);
      const lostEdges = graph.edges.length - arrows.length;
      useDiagramStore.getState().loadDiagram(blocks, arrows);
      // 워크플로우 이름 복원(있을 때만 — 하위호환).
      if (parsed && typeof parsed.title === "string" && parsed.title.trim()) {
        setTitle(parsed.title);
      }
      if (lostEdges > 0) {
        alert(`불러왔습니다. 단, source/target 노드를 찾지 못한 연결선 ${lostEdges}개는 제외되었습니다.`);
      }
    } catch (err) {
      alert(`불러오기 실패: ${err instanceof Error ? err.message : "올바른 다이어그램 JSON이 아닙니다."}`);
    }
  };

  return (
    <header className="topbar">
      <span className="topbar__brand">AI Agent Simulation</span>
      <input
        className="topbar__title-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="구조도 제목"
        aria-label="구조도 제목"
      />

      <div className="topbar__tools">
        <button className="tool-btn" onClick={undo} disabled={!canUndo} title="실행 취소 (Ctrl+Z)">
          ↶
        </button>
        <button className="tool-btn" onClick={redo} disabled={!canRedo} title="다시 실행 (Ctrl+Shift+Z)">
          ↷
        </button>

        {multi && (
          <>
            <span className="tool-sep" />
            <button className="tool-btn" onClick={() => alignSelection("left")} title="왼쪽 정렬">⇤</button>
            <button className="tool-btn" onClick={() => alignSelection("centerX")} title="가로 가운데 정렬">⇆</button>
            <button className="tool-btn" onClick={() => alignSelection("right")} title="오른쪽 정렬">⇥</button>
            <button className="tool-btn" onClick={() => alignSelection("top")} title="위쪽 정렬">⤒</button>
            <button className="tool-btn" onClick={() => alignSelection("centerY")} title="세로 가운데 정렬">⇅</button>
            <button className="tool-btn" onClick={() => alignSelection("bottom")} title="아래쪽 정렬">⤓</button>
            {many && (
              <>
                <span className="tool-sep" />
                <button className="tool-btn" onClick={() => distributeSelection("x")} title="가로 간격 동일">↔|↔</button>
                <button className="tool-btn" onClick={() => distributeSelection("y")} title="세로 간격 동일">↕|↕</button>
              </>
            )}
            <span className="tool-sep" />
            <button className="tool-btn" onClick={group} title="그룹화 (Ctrl+G)">그룹</button>
            <button className="tool-btn" onClick={ungroup} title="그룹 해제 (Ctrl+Shift+G)">해제</button>
          </>
        )}
        {selection.length >= 1 && (
          <button className="tool-btn" onClick={duplicateSelection} title="복제 (Ctrl+D)">복제</button>
        )}
      </div>

      <div className="topbar__spacer" />
      <div className="topbar__zoom" title="Ctrl + 휠로 확대/축소">
        <button className="tool-btn" onClick={zoomOut} aria-label="축소">−</button>
        <button className="tool-btn topbar__zoom-val" onClick={resetZoom} title="100%로 초기화">
          {Math.round(zoom * 100)}%
        </button>
        <button className="tool-btn" onClick={zoomIn} aria-label="확대">+</button>
      </div>
      <button className="btn" onClick={() => fileRef.current?.click()} title="JSON 불러오기">
        불러오기
      </button>
      <button className="btn" onClick={handleExportJson} title="다이어그램을 JSON으로 저장">
        JSON 저장
      </button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={handleImportJson} />
      <button
        className="btn"
        onClick={togglePanel}
        title="워크플로 실행 패널 열기"
      >
        {runStatus === "running" ? "▶ 실행 중…" : "▶ Run"}
      </button>
      <button
        className="btn"
        onClick={onSaveSized}
        disabled={saving}
        title="1080×1440(세로형) 비율 유지로 내보내기"
      >
        {saving ? "저장 중…" : "1080×1440"}
      </button>
      <button className="btn btn--primary" onClick={onSave} disabled={saving}>
        {saving ? "저장 중…" : "저장 (PNG)"}
      </button>
    </header>
  );
}

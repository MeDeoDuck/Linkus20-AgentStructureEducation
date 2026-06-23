import { useDiagramStore } from "../store/useDiagramStore";

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

  const multi = selection.length >= 2;
  const many = selection.length >= 3;

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

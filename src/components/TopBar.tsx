import { useDiagramStore } from "../store/useDiagramStore";

interface TopBarProps {
  onSave: () => void;
  saving: boolean;
}

export default function TopBar({ onSave, saving }: TopBarProps) {
  const title = useDiagramStore((s) => s.title);
  const setTitle = useDiagramStore((s) => s.setTitle);

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
      <div className="topbar__spacer" />
      <button className="btn btn--primary" onClick={onSave} disabled={saving}>
        {saving ? "저장 중…" : "저장 (PNG)"}
      </button>
    </header>
  );
}

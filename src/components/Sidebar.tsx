import type { BlockType } from "../types";
import { useDiagramStore } from "../store/useDiagramStore";

interface PaletteEntry {
  type: BlockType | "arrow";
  label: string;
  glyph: JSX.Element;
}

const ENTRIES: PaletteEntry[] = [
  {
    type: "user",
    label: "사용자",
    glyph: (
      <svg width="30" height="26" viewBox="0 0 30 26">
        <circle cx="15" cy="13" r="11" fill="#fff" stroke="#6b7280" />
      </svg>
    ),
  },
  {
    type: "rectangle",
    label: "사각형",
    glyph: (
      <svg width="32" height="22" viewBox="0 0 32 22">
        <rect x="2" y="2" width="28" height="18" rx="2" fill="#fff" stroke="#6b7280" />
      </svg>
    ),
  },
  {
    type: "diamond",
    label: "조건",
    glyph: (
      <svg width="28" height="26" viewBox="0 0 28 26">
        <polygon points="14,2 26,13 14,24 2,13" fill="#fff" stroke="#6b7280" />
      </svg>
    ),
  },
  {
    type: "rounded",
    label: "프로세스",
    glyph: (
      <svg width="32" height="22" viewBox="0 0 32 22">
        <rect x="2" y="2" width="28" height="18" rx="9" fill="#fff" stroke="#6b7280" />
      </svg>
    ),
  },
  {
    type: "arrow",
    label: "화살표",
    glyph: (
      <svg width="32" height="22" viewBox="0 0 32 22">
        <line x1="3" y1="11" x2="25" y2="11" stroke="#374151" strokeWidth="2" />
        <polygon points="25,6 31,11 25,16" fill="#374151" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const addBlock = useDiagramStore((s) => s.addBlock);
  const addArrow = useDiagramStore((s) => s.addArrow);

  const handleClick = (type: BlockType | "arrow") => {
    if (type === "arrow") addArrow();
    else addBlock(type);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar__label">도형</div>
      {ENTRIES.map((entry) => (
        <button
          key={entry.type}
          className="palette-item"
          onClick={() => handleClick(entry.type)}
          title={`${entry.label} 추가`}
        >
          <span className="palette-glyph">{entry.glyph}</span>
          {entry.label}
        </button>
      ))}
    </aside>
  );
}

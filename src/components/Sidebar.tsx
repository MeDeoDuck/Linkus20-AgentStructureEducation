import { useRef } from "react";
import type { BlockType } from "../types";
import { useDiagramStore } from "../store/useDiagramStore";
import { ACCEPT_ATTR, fileToImageElement } from "../utils/imageUtils";
import { CANVAS_H, CANVAS_W } from "../utils/anchors";

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

const UPLOAD_GLYPH = (
  <svg width="28" height="24" viewBox="0 0 28 24">
    <rect x="2" y="3" width="24" height="18" rx="3" fill="#fff" stroke="#6b7280" />
    <circle cx="9" cy="9" r="2.4" fill="#9ca3af" />
    <path d="M4 19 L11 12 L16 17 L19 14 L24 19 Z" fill="#cbd5e1" />
  </svg>
);

export default function Sidebar() {
  const addBlock = useDiagramStore((s) => s.addBlock);
  const addArrow = useDiagramStore((s) => s.addArrow);
  const addImageElement = useDiagramStore((s) => s.addImageElement);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleClick = (type: BlockType | "arrow") => {
    if (type === "arrow") addArrow();
    else addBlock(type);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const el = await fileToImageElement(file, { x: CANVAS_W / 2, y: CANVAS_H / 2 });
    if (el) addImageElement(el);
    else alert("지원하지 않는 이미지 형식입니다. (PNG, JPEG, WEBP)");
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

      <div className="sidebar__label">이미지</div>
      <button
        className="palette-item"
        onClick={() => fileRef.current?.click()}
        title="이미지 업로드"
      >
        <span className="palette-glyph">{UPLOAD_GLYPH}</span>
        업로드
      </button>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT_ATTR}
        hidden
        onChange={handleFile}
      />
    </aside>
  );
}

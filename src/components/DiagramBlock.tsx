import { useEffect, useRef, useState } from "react";
import type { AIType, BlockLogo, DiagramBlock as Block } from "../types";
import { useDiagramStore } from "../store/useDiagramStore";
import ResizeHandles from "./ResizeHandles";
import LogoGrid from "./LogoGrid";
import AIModal from "./AIModal";

interface DiagramBlockProps {
  block: Block;
  canvasRef: React.RefObject<HTMLDivElement>;
}

export default function DiagramBlock({ block, canvasRef }: DiagramBlockProps) {
  const selectedId = useDiagramStore((s) => s.selectedId);
  const selectedKind = useDiagramStore((s) => s.selectedKind);
  const select = useDiagramStore((s) => s.select);
  const moveBlock = useDiagramStore((s) => s.moveBlock);
  const updateBlock = useDiagramStore((s) => s.updateBlock);

  const selected = selectedKind === "block" && selectedId === block.id;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [draftText, setDraftText] = useState(block.text);
  const dragState = useRef<{ active: boolean; sx: number; sy: number; ox: number; oy: number; moved: boolean }>(
    { active: false, sx: 0, sy: 0, ox: 0, oy: 0, moved: false }
  );

  useEffect(() => {
    setDraftText(block.text);
  }, [block.text]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (editingText) return;
    e.stopPropagation();
    select(block.id, "block");
    dragState.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      ox: block.x,
      oy: block.y,
      moved: false,
    };

    const scale = 1; // canvas is unscaled
    const onMove = (ev: PointerEvent) => {
      const ds = dragState.current;
      if (!ds.active) return;
      const dx = (ev.clientX - ds.sx) / scale;
      const dy = (ev.clientY - ds.sy) / scale;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) ds.moved = true;
      const nx = Math.min(Math.max(0, ds.ox + dx), 2400 - block.width);
      const ny = Math.min(Math.max(0, ds.oy + dy), 1600 - block.height);
      moveBlock(block.id, nx, ny);
    };
    const onUp = () => {
      dragState.current.active = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setModalOpen(true);
  };

  const commitText = () => {
    updateBlock(block.id, { text: draftText });
    setEditingText(false);
  };

  const applyLogos = (aiType: AIType, logos: BlockLogo[]) => {
    updateBlock(block.id, { aiType, logos });
  };

  const applyText = (text: string) => {
    updateBlock(block.id, { text, logos: [], aiType: "custom" });
  };

  const hasLogos = (block.logos?.length ?? 0) > 0;
  const isDiamond = block.type === "diamond";

  // Avoid relying on canvasRef inside the block for now (kept for future pan/zoom).
  void canvasRef;

  return (
    <>
      <div
        className={[
          "block",
          `block--${block.type}`,
          selected ? "block--selected" : "",
        ].join(" ")}
        style={{ left: block.x, top: block.y, width: block.width, height: block.height }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
      >
        {isDiamond && <div className="block__diamond-shape" />}
        <div className="block__content">
          {hasLogos ? (
            <>
              {block.text && <div className="block__text block__text--small">{block.text}</div>}
              <LogoGrid logos={block.logos ?? []} />
            </>
          ) : editingText ? (
            <input
              className="block__text-input"
              autoFocus
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitText();
                if (e.key === "Escape") {
                  setDraftText(block.text);
                  setEditingText(false);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className="block__text"
              onClick={(e) => {
                // Don't enter text editing if this click ended a drag.
                if (dragState.current.moved) return;
                if (selected) {
                  e.stopPropagation();
                  setEditingText(true);
                }
              }}
            >
              {block.text}
            </div>
          )}
        </div>
        {selected && !editingText && <ResizeHandles block={block} />}
      </div>

      {modalOpen && (
        <AIModal
          onClose={() => setModalOpen(false)}
          onApplyLogos={applyLogos}
          onApplyText={applyText}
        />
      )}
    </>
  );
}

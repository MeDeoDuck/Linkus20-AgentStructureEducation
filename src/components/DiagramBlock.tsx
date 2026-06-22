import { useEffect, useRef, useState } from "react";
import type { AIType, DiagramBlock as Block } from "../types";
import { useDiagramStore } from "../store/useDiagramStore";
import ResizeHandles from "./ResizeHandles";
import BlockLogoView from "./BlockLogoView";
import AIModal from "./AIModal";
import {
  SMART_SNAP_THRESHOLD,
  calculateSmartSnapOnMove,
  collectBounds,
  getElementBounds,
} from "../utils/smartGuides";
import { isRefSelected } from "../utils/selection";
import { useSelectionGestures } from "../hooks/useSelectionGestures";

interface DiagramBlockProps {
  block: Block;
  canvasRef: React.RefObject<HTMLDivElement>;
}

export default function DiagramBlock({ block, canvasRef }: DiagramBlockProps) {
  const selection = useDiagramStore((s) => s.selection);
  const select = useDiagramStore((s) => s.select);
  const toggleSelection = useDiagramStore((s) => s.toggleSelection);
  const moveBlock = useDiagramStore((s) => s.moveBlock);
  const updateBlock = useDiagramStore((s) => s.updateBlock);
  const openLogoPicker = useDiagramStore((s) => s.openLogoPicker);
  const clearSelectedLogo = useDiagramStore((s) => s.clearSelectedLogo);
  const setSmartGuides = useDiagramStore((s) => s.setSmartGuides);
  const clearSmartGuides = useDiagramStore((s) => s.clearSmartGuides);
  const beginHistory = useDiagramStore((s) => s.beginHistory);
  const { startMove } = useSelectionGestures();

  const selected = isRefSelected({ type: "block", id: block.id }, selection);
  const isOnly = selected && selection.length === 1;

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

    // Shift-click toggles membership without dragging.
    if (e.shiftKey) {
      toggleSelection({ type: "block", id: block.id });
      return;
    }

    // If part of a multi-selection, drag moves the whole group.
    const ref = { type: "block" as const, id: block.id };
    let sel = useDiagramStore.getState().selection;
    if (!isRefSelected(ref, sel)) {
      select(block.id, "block");
      sel = useDiagramStore.getState().selection;
    }
    if (sel.length > 1) {
      startMove(e);
      return;
    }

    let begun = false;
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
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        ds.moved = true;
        if (!begun) {
          beginHistory();
          begun = true;
        }
      }
      // Read latest state each frame (avoid stale-closure snap targets/dims).
      const st = useDiagramStore.getState();
      const cur = st.blocks.find((b) => b.id === block.id);
      const w = cur?.width ?? block.width;
      const h = cur?.height ?? block.height;
      let nx = Math.min(Math.max(0, ds.ox + dx), 2400 - w);
      let ny = Math.min(Math.max(0, ds.oy + dy), 1600 - h);

      // Smart alignment: nudge toward other objects' edges/centers + show guides.
      const moving = getElementBounds({ id: block.id, x: nx, y: ny, width: w, height: h });
      const others = collectBounds(st.blocks, st.images, block.id);
      const { dx: sdx, dy: sdy, guides } = calculateSmartSnapOnMove(moving, others, SMART_SNAP_THRESHOLD);
      nx = Math.min(Math.max(0, nx + sdx), 2400 - block.width);
      ny = Math.min(Math.max(0, ny + sdy), 1600 - block.height);
      setSmartGuides(guides);

      moveBlock(block.id, nx, ny);
    };
    const onUp = () => {
      dragState.current.active = false;
      clearSmartGuides();
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

  // Choosing a category opens the bottom-sheet picker for this block.
  const handlePickCategory = (aiType: Exclude<AIType, "custom">) => {
    updateBlock(block.id, { aiType });
    openLogoPicker(block.id, aiType);
  };

  // Direct input replaces any selected logo with plain text.
  const applyText = (text: string) => {
    updateBlock(block.id, { text, aiType: "custom" });
    clearSelectedLogo(block.id);
  };

  const logo = block.selectedLogo;
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
          {logo ? (
            <BlockLogoView key={logo.logoUrl ?? logo.name} logo={logo} block={block} />
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
                if (isOnly) {
                  e.stopPropagation();
                  setEditingText(true);
                }
              }}
            >
              {block.text}
            </div>
          )}
        </div>
        {isOnly && !editingText && <ResizeHandles block={block} />}
      </div>

      {modalOpen && (
        <AIModal
          onClose={() => setModalOpen(false)}
          onPickCategory={handlePickCategory}
          onApplyText={applyText}
        />
      )}
    </>
  );
}

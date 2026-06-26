import { useEffect, useRef, useState } from "react";
import type { AIType, DiagramBlock as Block } from "../types";
import { useDiagramStore } from "../store/useDiagramStore";
import { useViewportStore } from "../store/useViewportStore";
import { useRunStore, type NodeStatus } from "../store/useRunStore";
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

/** 실행 상태별 테두리 색(pending 회색/running 파랑/succeeded 초록/failed 빨강/skipped 연회색). */
const RUN_STATUS_COLOR: Record<NodeStatus, string> = {
  pending: "#9ca3af",
  running: "#3b82f6",
  succeeded: "#22c55e",
  failed: "#ef4444",
  skipped: "#d1d5db",
};

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

  // 실행 상태(빌드 상태와 분리). 현재 run 에서 이 블록의 노드 status 만 구독.
  const runStatus = useRunStore((s) => s.current?.nodeRuns.find((r) => r.nodeId === block.id)?.status);

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

    const scale = useViewportStore.getState().zoom; // 화면 px → 캔버스 px 보정
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

  const openContextMenu = useViewportStore((s) => s.openContextMenu);
  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ref = { type: "block" as const, id: block.id };
    if (!isRefSelected(ref, useDiagramStore.getState().selection)) select(block.id, "block");
    openContextMenu(e.clientX, e.clientY, ref);
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
        style={{
          left: block.x,
          top: block.y,
          width: block.width,
          height: block.height,
          zIndex: block.zIndex,
          ...(runStatus
            ? { outline: `3px solid ${RUN_STATUS_COLOR[runStatus]}`, outlineOffset: 2 }
            : {}),
        }}
        onPointerDown={onPointerDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
      >
        {block.nodeRole && (
          <span
            style={{
              position: "absolute",
              top: -9,
              left: -2,
              fontSize: 9,
              lineHeight: "12px",
              padding: "0 4px",
              borderRadius: 6,
              background: "#111827",
              color: "#fff",
              fontWeight: 700,
              letterSpacing: 0.2,
              pointerEvents: "none",
              zIndex: 2,
            }}
          >
            {block.nodeRole}
          </span>
        )}
        {isDiamond && (
          <svg className="block__diamond-svg" width={block.width} height={block.height}>
            {/* 네 꼭짓점(위·오른쪽·아래·왼쪽) 기준 진짜 마름모. width≠height 여도 변형 없음. */}
            <polygon
              points={`${block.width / 2},0 ${block.width},${block.height / 2} ${block.width / 2},${block.height} 0,${block.height / 2}`}
              fill="var(--bg)"
              stroke={selected ? "var(--accent)" : "var(--border-strong)"}
              strokeWidth={selected ? 3 : 1.5}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
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
          block={block}
          onSaveNodeRole={(patch) => updateBlock(block.id, patch)}
        />
      )}
    </>
  );
}

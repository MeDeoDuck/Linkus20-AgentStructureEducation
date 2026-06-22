import { forwardRef, useRef, useState } from "react";
import { useDiagramStore } from "../store/useDiagramStore";
import DiagramBlock from "./DiagramBlock";
import ArrowLayer from "./ArrowLayer";
import ImageElementView from "./ImageElementView";
import SmartGuideOverlay from "./SmartGuideOverlay";
import GroupSelectionBox from "./GroupSelectionBox";
import { refsInMarquee, type Rect } from "../utils/selection";

const Canvas = forwardRef<HTMLDivElement>(function Canvas(_props, ref) {
  const blocks = useDiagramStore((s) => s.blocks);
  const images = useDiagramStore((s) => s.images);
  const smartGuides = useDiagramStore((s) => s.smartGuides);
  const clearSelection = useDiagramStore((s) => s.clearSelection);
  const setSelection = useDiagramStore((s) => s.setSelection);
  const closeLogoPicker = useDiagramStore((s) => s.closeLogoPicker);

  const innerRef = useRef<HTMLDivElement | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);

  const setRefs = (node: HTMLDivElement | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  // Background drag = marquee selection (canvas px === screen px, scale 1).
  const onBackgroundPointerDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return;
    const node = innerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    const additive = e.shiftKey;

    if (!additive) clearSelection();
    closeLogoPicker();

    const onMove = (ev: PointerEvent) => {
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      setMarquee({
        x: Math.min(startX, cx),
        y: Math.min(startY, cy),
        width: Math.abs(cx - startX),
        height: Math.abs(cy - startY),
      });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const cx = ev.clientX - rect.left;
      const cy = ev.clientY - rect.top;
      const box: Rect = {
        x: Math.min(startX, cx),
        y: Math.min(startY, cy),
        width: Math.abs(cx - startX),
        height: Math.abs(cy - startY),
      };
      setMarquee(null);
      // Treat as a real marquee only if the user actually dragged.
      if (box.width < 3 && box.height < 3) return;
      const st = useDiagramStore.getState();
      const hits = refsInMarquee(box, st, "intersects");
      if (additive) {
        const merged = [...st.selection];
        const has = (t: string, id: string) => merged.some((r) => r.type === t && r.id === id);
        for (const h of hits) if (!has(h.type, h.id)) merged.push(h);
        setSelection(merged);
      } else {
        setSelection(hits);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="canvas-wrap">
      <div className="canvas" ref={setRefs} onPointerDown={onBackgroundPointerDown}>
        <ArrowLayer />
        {blocks.map((block) => (
          <DiagramBlock key={block.id} block={block} canvasRef={innerRef} />
        ))}
        {/* Images render above blocks (always-on-top z-order). */}
        {images.map((img) => (
          <ImageElementView key={img.id} img={img} />
        ))}
        {/* Smart alignment guides + group selection box on top (below selection handles). */}
        <SmartGuideOverlay guides={smartGuides} />
        <GroupSelectionBox />
        {marquee && (
          <div
            className="marquee-selection-box"
            data-no-export="true"
            style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }}
          />
        )}
      </div>
    </div>
  );
});

export default Canvas;

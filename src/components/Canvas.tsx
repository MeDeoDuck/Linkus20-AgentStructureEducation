import { forwardRef, useRef } from "react";
import { useDiagramStore } from "../store/useDiagramStore";
import DiagramBlock from "./DiagramBlock";
import ArrowLayer from "./ArrowLayer";
import ImageElementView from "./ImageElementView";
import SmartGuideOverlay from "./SmartGuideOverlay";

const Canvas = forwardRef<HTMLDivElement>(function Canvas(_props, ref) {
  const blocks = useDiagramStore((s) => s.blocks);
  const images = useDiagramStore((s) => s.images);
  const smartGuides = useDiagramStore((s) => s.smartGuides);
  const clearSelection = useDiagramStore((s) => s.clearSelection);
  const closeLogoPicker = useDiagramStore((s) => s.closeLogoPicker);

  const innerRef = useRef<HTMLDivElement | null>(null);

  const setRefs = (node: HTMLDivElement | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  return (
    <div className="canvas-wrap">
      <div
        className="canvas"
        ref={setRefs}
        onPointerDown={(e) => {
          // Only clear when the background itself is clicked.
          if (e.target === e.currentTarget) {
            clearSelection();
            closeLogoPicker();
          }
        }}
      >
        <ArrowLayer />
        {blocks.map((block) => (
          <DiagramBlock key={block.id} block={block} canvasRef={innerRef} />
        ))}
        {/* Images render above blocks (always-on-top z-order). */}
        {images.map((img) => (
          <ImageElementView key={img.id} img={img} />
        ))}
        {/* Smart alignment guides on top of everything (below selection handles). */}
        <SmartGuideOverlay guides={smartGuides} />
      </div>
    </div>
  );
});

export default Canvas;

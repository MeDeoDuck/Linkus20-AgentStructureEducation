import { forwardRef, useRef } from "react";
import { useDiagramStore } from "../store/useDiagramStore";
import DiagramBlock from "./DiagramBlock";
import ArrowLayer from "./ArrowLayer";

const Canvas = forwardRef<HTMLDivElement>(function Canvas(_props, ref) {
  const blocks = useDiagramStore((s) => s.blocks);
  const clearSelection = useDiagramStore((s) => s.clearSelection);

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
          if (e.target === e.currentTarget) clearSelection();
        }}
      >
        <ArrowLayer />
        {blocks.map((block) => (
          <DiagramBlock key={block.id} block={block} canvasRef={innerRef} />
        ))}
      </div>
    </div>
  );
});

export default Canvas;

import { useDiagramStore } from "../store/useDiagramStore";
import ArrowElement from "./ArrowElement";

/**
 * Single SVG layer that covers the whole canvas (2400x1600) in the SAME
 * coordinate space as the blocks. All arrows are drawn here as <g transform>
 * groups, so they are always captured inside canvasRef when exporting to PNG
 * (no per-arrow absolutely-positioned <svg> boxes that could slip outside the
 * canvas bounds and get clipped by html-to-image).
 *
 * The layer itself ignores pointer events; each arrow's path/handles opt back
 * in via pointer-events:auto so the rest of the canvas stays interactive.
 */
export default function ArrowLayer() {
  const arrows = useDiagramStore((s) => s.arrows);

  return (
    <svg
      className="arrow-layer"
      width={2400}
      height={1600}
      viewBox="0 0 2400 1600"
    >
      {arrows.map((arrow) => (
        <ArrowElement key={arrow.id} arrow={arrow} />
      ))}
    </svg>
  );
}
